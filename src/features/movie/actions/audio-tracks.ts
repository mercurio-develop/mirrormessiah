'use server';

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
} from '@/lib/audio-path';

const execAsync = promisify(exec);

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

export async function getAudioTracks(encodedPath: string): Promise<AudioTrackInfo[]> {
  try {
    let filePath = b64urlDecode(encodedPath);
    filePath = resolveOriginalMediaPath(filePath);

    const isValid = await validateFilePath(filePath);
    if (!isValid) return [];

    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`);
    const data = JSON.parse(stdout);

    const audioStreams = data.streams?.filter((s: { codec_type?: string }) => s.codec_type === 'audio') || [];
    const activeFromCache = activeAudioIndexFromPath(b64urlDecode(encodedPath));
    const hasExplicitDefault = audioStreams.some(
      (s: { disposition?: { default?: number } }) => s.disposition?.default === 1
    );

    return audioStreams.map((s: { index: number; codec_name: string; tags?: Record<string, string>; disposition?: { default?: number } }, i: number) => {
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
        codec: s.codec_name,
        language,
        title: displayTitle(s, language),
        isDefault,
      };
    });
  } catch (error) {
    console.error('[getAudioTracks] Error:', error);
    return [];
  }
}

export async function setDefaultAudioTrack(
  encodedPath: string,
  trackIndex: number
): Promise<{ success: boolean; encodedPath?: string }> {
  try {
    let filePath = b64urlDecode(encodedPath);
    filePath = resolveOriginalMediaPath(filePath);

    const isValid = await validateFilePath(filePath);
    if (!isValid) return { success: false };

    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`);
    const data = JSON.parse(stdout);
    const audioStreams = data.streams?.filter((s: { codec_type?: string }) => s.codec_type === 'audio') || [];

    if (!audioStreams.some((s: { index: number }) => s.index === trackIndex)) {
      return { success: false };
    }

    const outputPath = cachePathForTrack(filePath, trackIndex);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    let mapArgs = `-map 0:v:0 -map 0:${trackIndex}`;
    for (const stream of audioStreams) {
      if (stream.index !== trackIndex) {
        mapArgs += ` -map 0:${stream.index}`;
      }
    }

    const cmd = `ffmpeg -y -i "${filePath}" ${mapArgs} -c copy -movflags +faststart "${outputPath}"`;
    console.log('[setDefaultAudioTrack] Running:', cmd);

    await execAsync(cmd);

    const encodedCachePath = b64urlEncode(outputPath);
    return { success: true, encodedPath: encodedCachePath };
  } catch (error) {
    console.error('[setDefaultAudioTrack] Error:', error);
    return { success: false };
  }
}

/** Resolve stream path: use cached remux when present for the preferred track. */
export async function resolveAudioStreamPath(
  encodedPath: string,
  trackIndex: number | null
): Promise<string> {
  const filePath = resolveOriginalMediaPath(b64urlDecode(encodedPath));
  if (!(await validateFilePath(filePath))) return encodedPath;

  if (trackIndex === null) return encodedPath;

  const cacheFile = cachePathForTrack(filePath, trackIndex);
  try {
    await fs.access(cacheFile);
    return b64urlEncode(cacheFile);
  } catch {
    return encodedPath;
  }
}
