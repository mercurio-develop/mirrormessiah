import { getDb } from '@/lib/db';
import { b64urlEncode, getMimeType } from '@/lib/pathenc';

export function getMoviePlayback(id: number) {
  const db = getDb();
  
  const movie = db.prepare('SELECT id, title FROM movies WHERE id = ?').get(id) as any;
  if (!movie) return null;

  // 1. Try strict match: MP4 and 1080p
  let bestFile = db.prepare(`
    SELECT path, mime_type, size_bytes
    FROM files
    WHERE movie_id = ? 
    AND lower(path) LIKE '%.mp4'
    AND (path LIKE '%1080p%' OR path LIKE '%FHD%')
    LIMIT 1
  `).get(id) as { path: string; mime_type: string | null } | undefined;

  // 2. Fallback to any MP4
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

  const subtitles = db.prepare(`
    SELECT path, lang, format FROM subtitles WHERE movie_id = ?
  `).all(id) as any[];

  return {
    source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}` },
    mimeType: actualMime,
    subtitles: subtitles.map(s => ({
      src: `/api/subtitle?path=${b64urlEncode(s.path)}`,
      srclang: s.lang || 'en',
      label: `${(s.lang || 'en').toUpperCase()}`
    })),
    movie: { id, title: movie.title }
  };
}
