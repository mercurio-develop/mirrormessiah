import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';

export function getEpisodePlayback(id: number) {
  const db = getDb();
  
  try {
      const episode = db.prepare(`
        SELECT e.id, e.title, e.episode_number, e.plot, e.runtime, e.thumbnail, s.season_number, s.series_id, ser.title as series_title
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        JOIN series ser ON s.series_id = ser.id
        WHERE e.id = ?
      `).get(id) as any;

      if (!episode) return null;

      // 1. TOP PRIORITY: MP4, 1080p, and NOT x265/10bit (Most compatible high quality)
      let bestFile = db.prepare(`
        SELECT path, mime_type, size_bytes
        FROM episode_files
        WHERE episode_id = ? 
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
          FROM episode_files
          WHERE episode_id = ? 
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
          FROM episode_files
          WHERE episode_id = ? 
          AND lower(path) LIKE '%.mp4'
          AND (path LIKE '%1080p%' OR path LIKE '%FHD%')
          LIMIT 1
        `).get(id) as { path: string; mime_type: string | null } | undefined;
      }

      // 4. Fallback to any MP4
      if (!bestFile) {
        bestFile = db.prepare(`
          SELECT path, mime_type, size_bytes
          FROM episode_files
          WHERE episode_id = ? 
          AND lower(path) LIKE '%.mp4'
          LIMIT 1
        `).get(id) as { path: string; mime_type: string | null } | undefined;
      }

      if (!bestFile) {
        bestFile = db.prepare(`
          SELECT path, mime_type, size_bytes
          FROM episode_files
          WHERE episode_id = ? 
          AND lower(path) LIKE '%.mkv'
          LIMIT 1
        `).get(id) as { path: string; mime_type: string | null } | undefined;
      }

      if (!bestFile) {
        bestFile = db.prepare(`
          SELECT path, mime_type, size_bytes
          FROM episode_files
          WHERE episode_id = ? 
          LIMIT 1
        `).get(id) as { path: string; mime_type: string | null } | undefined;
      }

      if (!bestFile) return null;

      const actualMime = getMimeType(bestFile.path);

      const subtitles = db.prepare(`
        SELECT path, lang, label, format FROM episode_subtitles WHERE episode_id = ?
      `).all(id) as any[];

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

      const uniqueSubs: any[] = [];
      const seenLangs = new Set<string>();
      const limit = 8;

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
            default: uniqueSubs.length === 0
          });
      }

      return {
        source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}&v=${Date.now()}` },
        mimeType: actualMime,
        subtitles: uniqueSubs,
        episode: { 
            id, 
            series_id: episode.series_id,
            title: episode.title, 
            series_title: episode.series_title,
            season_number: episode.season_number,
            episode_number: episode.episode_number,
            plot: episode.plot,
            runtime: episode.runtime,
            thumbnail: episode.thumbnail
        }
      };
  } catch (e: any) {
      if (e.message.includes('no such table')) return null;
      throw e;
  }
}
