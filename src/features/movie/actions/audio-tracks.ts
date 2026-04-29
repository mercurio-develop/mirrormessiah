'use server';

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { b64urlDecode } from '@/lib/b64url';
import { validateFilePath } from '@/lib/pathenc';

const execAsync = promisify(exec);

export interface AudioTrackInfo {
  index: number;
  codec: string;
  language: string;
  title: string;
}

export async function getAudioTracks(encodedPath: string): Promise<AudioTrackInfo[]> {
  try {
    console.log('[getAudioTracks] Received encoded path:', encodedPath);
    let filePath = b64urlDecode(encodedPath);
    console.log('[getAudioTracks] Decoded file path:', filePath);
    const isValid = await validateFilePath(filePath);
    if (!isValid) {
        console.warn('[getAudioTracks] Path validation failed for:', filePath);
        return [];
    }

    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`);
    const data = JSON.parse(stdout);

    const audioStreams = data.streams?.filter((s: any) => s.codec_type === 'audio') || [];
    console.log(`[getAudioTracks] Found ${audioStreams.length} audio streams`);
    
    return audioStreams.map((s: any) => ({
      index: s.index,
      codec: s.codec_name,
      language: s.tags?.language || 'und',
      title: s.tags?.title || s.tags?.handler_name || 'Audio Track'
    }));

  } catch (error) {
    console.error('[getAudioTracks] Error:', error);
    return [];
  }
}

export async function setDefaultAudioTrack(encodedPath: string, trackIndex: number): Promise<boolean> {
  try {
    let filePath = b64urlDecode(encodedPath);
    const isValid = await validateFilePath(filePath);
    if (!isValid) return false;

    // Get all audio streams to avoid duplication
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`);
    const data = JSON.parse(stdout);
    const audioStreams = data.streams?.filter((s: any) => s.codec_type === 'audio') || [];

    const parsedPath = path.parse(filePath);
    const tempPath = path.join(parsedPath.dir, `.mm_tmp_audio_${parsedPath.base}`);

    let mapArgs = `-map 0:v:0 -map 0:${trackIndex}`;
    for (const stream of audioStreams) {
      if (stream.index !== trackIndex) {
        mapArgs += ` -map 0:${stream.index}`;
      }
    }

    const cmd = `ffmpeg -y -i "${filePath}" ${mapArgs} -c copy -movflags +faststart "${tempPath}"`;
    console.log('[setDefaultAudioTrack] Running:', cmd);

    await execAsync(cmd);
    await fs.rename(tempPath, filePath);
    
    return true;

  } catch (error) {
    console.error('[setDefaultAudioTrack] Error:', error);
    return false;
  }
}
