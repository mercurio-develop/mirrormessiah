import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { b64urlDecode, b64urlEncode } from '@/lib/b64url';
import { validateFilePath } from '@/lib/pathenc';
import {
  resolveOriginalMediaPath,
  activeAudioIndexFromPath,
  cachePathForTrack,
  sidecarAudioPath,
} from '@/lib/audio-path';

const execAsync = promisify(exec);

type FfprobeStream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  tags?: Record<string, string>;
  disposition?: { default?: number };
};

async function probeStreams(filePath: string): Promise<FfprobeStream[]> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_streams "${filePath}"`,
  );
  const data = JSON.parse(stdout);
  return data.streams || [];
}

/** Legacy remuxes kept every audio stream and often marked the wrong one default. */
async function isValidCacheFile(
  cachePath: string,
  sourcePath: string,
  trackIndex: number,
): Promise<boolean> {
  try {
    const stats = await fs.stat(cachePath);
    if (stats.size < 1024) return false;

    const sourceStreams = await probeStreams(sourcePath);
    const sourceTrack = sourceStreams.find(
      (s) => s.codec_type === 'audio' && s.index === trackIndex,
    );
    if (!sourceTrack) return false;

    const expectedLang = sourceTrack.tags?.language || 'und';
    const cacheStreams = await probeStreams(cachePath);
    const cacheAudio = cacheStreams.filter((s) => s.codec_type === 'audio');

    if (cacheAudio.length !== 1) return false;
    if ((cacheAudio[0].tags?.language || 'und') !== expectedLang) return false;
    if (cacheAudio[0].disposition?.default !== 1) return false;

    return true;
  } catch {
    return false;
  }
}

export async function resolveCachedAudioPath(
  encodedSourcePath: string,
  trackIndex: number,
): Promise<string | null> {
  try {
    const sourcePath = resolveOriginalMediaPath(b64urlDecode(encodedSourcePath));
    if (!(await validateFilePath(sourcePath))) return null;

    const cachePath = cachePathForTrack(sourcePath, trackIndex);
    if (await isValidCacheFile(cachePath, sourcePath, trackIndex)) {
      return b64urlEncode(cachePath);
    }

    return null;
  } catch {
    return null;
  }
}

export interface AudioTrackInfo {
  index: number;
  codec: string;
  language: string;
  title: string;
  isDefault: boolean;
}

function displayTitle(stream: { tags?: Record<string, string> }, language: string): string {
  const langLabels: Record<string, string> = {
    eng: 'English', en: 'English', rus: 'Russian', ru: 'Russian',
    spa: 'Spanish', es: 'Spanish', ita: 'Italian', it: 'Italian',
    jpn: 'Japanese', ja: 'Japanese', fre: 'French', fr: 'French',
    deu: 'German', de: 'German', por: 'Portuguese', pt: 'Portuguese',
  };
  const tagTitle = stream.tags?.title || stream.tags?.handler_name;
  if (tagTitle && tagTitle !== 'SoundHandler') return tagTitle;
  return langLabels[language.toLowerCase()] || language.toUpperCase();
}

export async function listAudioTracks(encodedPath: string): Promise<AudioTrackInfo[]> {
  try {
    let filePath = b64urlDecode(encodedPath);
    filePath = resolveOriginalMediaPath(filePath);

    if (!(await validateFilePath(filePath))) return [];

    const audioStreams = (await probeStreams(filePath)).filter(
      (s) => s.codec_type === 'audio',
    );

    let activeFromCache: number | null = null;
    try {
      activeFromCache = activeAudioIndexFromPath(b64urlDecode(encodedPath));
    } catch {
      activeFromCache = null;
    }

    const hasExplicitDefault = audioStreams.some(
      (s: { disposition?: { default?: number } }) => s.disposition?.default === 1,
    );

    return audioStreams.map((s, i) => {
        const language = s.tags?.language || 'und';
        let isDefault = false;
        if (activeFromCache !== null) {
          isDefault = s.index === activeFromCache;
        } else if (hasExplicitDefault) {
          isDefault = s.disposition?.default === 1;
        } else {
          isDefault = i === 0;
        }

        return {
          index: s.index,
          codec: s.codec_name || 'unknown',
          language,
          title: displayTitle(s, language),
          isDefault,
        };
      });
  } catch (error) {
    console.error('[listAudioTracks] Error:', error);
    return [];
  }
}

export async function remuxAudioTrack(
  encodedPath: string,
  trackIndex: number,
): Promise<{ success: boolean; encodedPath?: string; error?: string }> {
  try {
    let filePath = b64urlDecode(encodedPath);
    filePath = resolveOriginalMediaPath(filePath);

    if (!(await validateFilePath(filePath))) {
      return { success: false, error: 'Invalid file path' };
    }

    const sourceStreams = await probeStreams(filePath);
    const audioStreams = sourceStreams.filter((s) => s.codec_type === 'audio');

    if (!audioStreams.some((s) => s.index === trackIndex)) {
      return { success: false, error: 'Audio track not found' };
    }

    const outputPath = cachePathForTrack(filePath, trackIndex);

    try {
      await fs.access(outputPath);
      if (await isValidCacheFile(outputPath, filePath, trackIndex)) {
        console.log('[remuxAudioTrack] Using cached remux:', outputPath);
        return { success: true, encodedPath: b64urlEncode(outputPath) };
      }
      console.log('[remuxAudioTrack] Removing invalid stale cache:', outputPath);
      await fs.unlink(outputPath).catch(() => {});
    } catch {
      // Cache miss
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const sidecarPath = sidecarAudioPath(filePath, trackIndex);
    let cmd: string;

    try {
      await fs.access(sidecarPath);
      const sidecarStats = await fs.stat(sidecarPath);
      if (sidecarStats.size > 1024) {
        console.log('[remuxAudioTrack] Using pre-extracted sidecar:', sidecarPath);
        cmd = [
          'ffmpeg -y',
          `-i "${filePath}"`,
          `-i "${sidecarPath}"`,
          '-map 0:v:0',
          '-map 1:a:0',
          '-dn',
          '-c copy',
          '-disposition:a:0 default',
          '-movflags +faststart',
          `"${outputPath}"`,
        ].join(' ');
      } else {
        throw new Error('Sidecar too small');
      }
    } catch {
      cmd = [
        'ffmpeg -y',
        `-i "${filePath}"`,
        '-map 0:v:0',
        `-map 0:${trackIndex}`,
        '-dn',
        '-c copy',
        '-disposition:a:0 default',
        '-movflags +faststart',
        `"${outputPath}"`,
      ].join(' ');
    }

    console.log('[remuxAudioTrack] Running:', cmd);
    await execAsync(cmd, { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 });

    if (!(await isValidCacheFile(outputPath, filePath, trackIndex))) {
      await fs.unlink(outputPath).catch(() => {});
      return { success: false, error: 'Remux produced an invalid cache file' };
    }

    return { success: true, encodedPath: b64urlEncode(outputPath) };
  } catch (error) {
    console.error('[remuxAudioTrack] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Remux failed',
    };
  }
}
