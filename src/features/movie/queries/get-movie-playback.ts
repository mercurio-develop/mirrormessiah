import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';

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

  const subtitles = db.prepare(`
    SELECT path, lang, label, format FROM subtitles WHERE movie_id = ?
  `).all(id) as any[];

  // ISO 639-2 (3-letter) → ISO 639-1 (2-letter) for srclang
  const langMap: Record<string, { code: string; label: string }> = {
    eng: { code: 'en', label: 'English' },
    spa: { code: 'es', label: 'Español' },
    fre: { code: 'fr', label: 'Français' },
    fra: { code: 'fr', label: 'Français' },
    ger: { code: 'de', label: 'Deutsch' },
    deu: { code: 'de', label: 'Deutsch' },
    por: { code: 'pt', label: 'Português' },
    ita: { code: 'it', label: 'Italiano' },
    jpn: { code: 'ja', label: '日本語' },
    chi: { code: 'zh', label: '中文' },
    zho: { code: 'zh', label: '中文' },
    rus: { code: 'ru', label: 'Русский' },
    ara: { code: 'ar', label: 'العربية' },
  };

  // Deduplicate and limit to prevent UI freezing
  const uniqueSubs: any[] = [];
  const seenLangs = new Set<string>();
  const limit = 8; // Reduced limit for better performance

  for (const s of subtitles) {
      if (uniqueSubs.length >= limit) break;
      const mapped = langMap[s.lang] ?? { code: s.lang || 'en', label: s.label || s.lang?.toUpperCase() || 'Subtitles' };
      
      const langKey = mapped.code;
      if (seenLangs.has(langKey)) continue;
      seenLangs.add(langKey);

      uniqueSubs.push({
        src: `/api/subtitle?path=${b64urlEncode(s.path)}`,
        srclang: mapped.code,
        label: s.label || mapped.label,
        default: uniqueSubs.length === 0 // Make first one default
      });
  }

  return {
    source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}` },
    mimeType: actualMime,
    subtitles: uniqueSubs,
    movie: { id, title: movie.title }
  };
}
