import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';
import { buildSubtitleTracks } from '@/lib/subtitle-tracks';
import { discoverMovieSubtitles } from '@/lib/movie-subtitles';
import fs from 'fs';

export function getMoviePlayback(id: number) {
  const db = getDb();
  
  const movie = db.prepare('SELECT id, title FROM movies WHERE id = ?').get(id) as any;
  if (!movie) return null;

  // 1. TOP PRIORITY: MP4, 1080p, and NOT x265/10bit (Most compatible high quality)
  let bestFile = db.prepare(`
    SELECT path, mime_type, size_bytes
    FROM files
    WHERE movie_id = ? 
    AND lower(path) LIKE '%.mp4'
    AND (path LIKE '%1080p%' OR path LIKE '%FHD%')
    AND path NOT LIKE '%x265%'
    AND path NOT LIKE '%10bit%'
    AND path NOT LIKE '%HEVC%'
    LIMIT 1
  `).get(id) as { path: string; mime_type: string | null } | undefined;

  // 2. High Compatibility: Any MP4 that is NOT x265/10bit
  if (!bestFile) {
    bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      AND lower(path) LIKE '%.mp4'
      AND path NOT LIKE '%x265%'
      AND path NOT LIKE '%10bit%'
      AND path NOT LIKE '%HEVC%'
      LIMIT 1
    `).get(id) as { path: string; mime_type: string | null } | undefined;
  }

  // 3. Fallback to 1080p MP4 even if it's x265 (Better than nothing)
  if (!bestFile) {
    bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      AND lower(path) LIKE '%.mp4'
      AND (path LIKE '%1080p%' OR path LIKE '%FHD%')
      LIMIT 1
    `).get(id) as { path: string; mime_type: string | null } | undefined;
  }

  // 4. Fallback to any MP4
  if (!bestFile) {
    bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      AND lower(path) LIKE '%.mp4'
      LIMIT 1
    `).get(id) as { path: string; mime_type: string | null } | undefined;
  }

  // 3. Fallback to MKV (will be served as video/mp4 for compatibility)
  if (!bestFile) {
    bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      AND lower(path) LIKE '%.mkv'
      LIMIT 1
    `).get(id) as { path: string; mime_type: string | null } | undefined;
  }

  // 4. Ultimate fallback to any file
  if (!bestFile) {
    bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      LIMIT 1
    `).get(id) as { path: string; mime_type: string | null } | undefined;
  }

  if (!bestFile) return null;

  const actualMime = getMimeType(bestFile.path);

  let subtitles = db.prepare(`
    SELECT path, lang, label, format FROM subtitles WHERE movie_id = ?
    ORDER BY lang ASC, path ASC
  `).all(id) as { path: string; lang: string | null; label: string | null; format: string | null }[];

  subtitles = subtitles.filter((s) => fs.existsSync(s.path));

  if (subtitles.length === 0) {
    subtitles = discoverMovieSubtitles(db, id);
  }

  const uniqueSubs = buildSubtitleTracks(subtitles);

  return {
    source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}&v=${Date.now()}` },
    mimeType: actualMime,
    subtitles: uniqueSubs,
    movie: { id, title: movie.title }
  };
}
