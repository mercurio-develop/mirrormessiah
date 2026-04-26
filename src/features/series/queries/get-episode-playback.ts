import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';

export function getEpisodePlayback(id: number) {
  const db = getDb();
  
  try {
      const episode = db.prepare(`
        SELECT e.id, e.title, e.episode_number, s.season_number, s.series_id, ser.title as series_title
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        JOIN series ser ON s.series_id = ser.id
        WHERE e.id = ?
      `).get(id) as any;

      if (!episode) return null;

      let bestFile = db.prepare(`
        SELECT path, mime_type, size_bytes
        FROM episode_files
        WHERE episode_id = ? 
        AND lower(path) LIKE '%.mp4'
        LIMIT 1
      `).get(id) as { path: string; mime_type: string | null } | undefined;

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
        episode: { 
            id, 
            series_id: episode.series_id,
            title: episode.title, 
            series_title: episode.series_title,
            season_number: episode.season_number,
            episode_number: episode.episode_number
        }
      };
  } catch (e: any) {
      if (e.message.includes('no such table')) return null;
      throw e;
  }
}
