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
    SELECT path, lang, label, format FROM subtitles WHERE movie_id = ?
  `).all(id) as any[];

  // ISO 639-2 (3-letter) → ISO 639-1 (2-letter) for srclang
  const langMap: Record<string, { code: string; label: string }> = {
    eng: { code: 'en', label: 'English' },
    spa: { code: 'es', label: 'Español' },
    fre: { code: 'fr', label: 'Français' },
    ger: { code: 'de', label: 'Deutsch' },
    por: { code: 'pt', label: 'Português' },
    ita: { code: 'it', label: 'Italiano' },
    jpn: { code: 'ja', label: '日本語' },
  };

  return {
    source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}` },
    mimeType: actualMime,
    subtitles: subtitles.map(s => {
      const mapped = langMap[s.lang] ?? { code: s.lang || 'en', label: s.label || s.lang?.toUpperCase() || 'Subtitles' };
      return {
        src: `/api/subtitle?path=${b64urlEncode(s.path)}`,
        srclang: mapped.code,
        label: s.label || mapped.label,
      };
    }),
    movie: { id, title: movie.title }
  };
}
