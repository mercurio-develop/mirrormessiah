import path from 'path';

/** If streaming from a cache remux, map back to the source file for ffprobe. */
export function resolveOriginalMediaPath(filePath: string): string {
  const parsed = path.parse(filePath);
  if (path.basename(parsed.dir) === '.mm_cache') {
    const match = parsed.base.match(/^(.+)\.aud(\d+)\.mp4$/i);
    if (match) {
      return path.join(path.dirname(parsed.dir), match[1]);
    }
  }
  return filePath;
}

/** Parse active audio stream index from a cache file path, or null if using the original. */
export function activeAudioIndexFromPath(filePath: string): number | null {
  const parsed = path.parse(filePath);
  if (path.basename(parsed.dir) === '.mm_cache') {
    const match = parsed.base.match(/^(.+)\.aud(\d+)\.mp4$/i);
    if (match) return parseInt(match[2], 10);
  }
  return null;
}

export function cachePathForTrack(sourcePath: string, trackIndex: number): string {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, '.mm_cache', `${parsed.base}.aud${trackIndex}.mp4`);
}

export function audioPreferenceKey(id: string | number): string {
  return `mm_audio_track_${id}`;
}

export function audioPathKey(id: string | number): string {
  return `mm_audio_path_${id}`;
}

/** Rebuild /api/stream URL using a new encoded path, preserving auth query params. */
export function rebuildStreamSrc(currentSrc: string, encodedPath: string): string {
  try {
    const urlObj = new URL(currentSrc, 'http://local');
    const token = urlObj.searchParams.get('t');
    const v = urlObj.searchParams.get('v');
    let next = `/api/stream?path=${encodeURIComponent(encodedPath)}`;
    if (v) next += `&v=${encodeURIComponent(v)}`;
    if (token) next += `&t=${encodeURIComponent(token)}`;
    return next;
  } catch {
    return `/api/stream?path=${encodeURIComponent(encodedPath)}`;
  }
}
