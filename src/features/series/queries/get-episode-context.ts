import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';
import { getEpisodePlayback } from './get-episode-playback';

export function getEpisodeContext(id: number) {
  const playback = getEpisodePlayback(id);
  if (!playback) return null;

  const db = getDb();
  const { episode } = playback;

  try {
    // 1. Get Playlist (all episodes in the same season)
    const playlist = db.prepare(`
      SELECT e.id, e.title, e.episode_number, e.thumbnail, e.runtime,
             EXISTS(SELECT 1 FROM episode_files WHERE episode_id = e.id) as has_file
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      WHERE s.series_id = ? AND s.season_number = ?
      ORDER BY e.episode_number ASC
    `).all(episode.series_id, episode.season_number) as any[];

    // 2. Find Next Episode
    // Try next episode in same season
    let nextEpisode = db.prepare(`
      SELECT e.id
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      WHERE s.series_id = ? AND s.season_number = ? AND e.episode_number > ?
      ORDER BY e.episode_number ASC
      LIMIT 1
    `).get(episode.series_id, episode.season_number, episode.episode_number) as { id: number } | undefined;

    // If not found, try first episode of next season
    if (!nextEpisode) {
      nextEpisode = db.prepare(`
        SELECT e.id
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ? AND s.season_number > ?
        ORDER BY s.season_number ASC, e.episode_number ASC
        LIMIT 1
      `).get(episode.series_id, episode.season_number) as { id: number } | undefined;
    }

    // 3. Find Previous Episode
    // Try previous episode in same season
    let prevEpisode = db.prepare(`
      SELECT e.id
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      WHERE s.series_id = ? AND s.season_number = ? AND e.episode_number < ?
      ORDER BY e.episode_number DESC
      LIMIT 1
    `).get(episode.series_id, episode.season_number, episode.episode_number) as { id: number } | undefined;

    // If not found, try last episode of previous season
    if (!prevEpisode) {
      prevEpisode = db.prepare(`
        SELECT e.id
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ? AND s.season_number < ?
        ORDER BY s.season_number DESC, e.episode_number DESC
        LIMIT 1
      `).get(episode.series_id, episode.season_number) as { id: number } | undefined;
    }

    return {
      ...playback,
      playlist,
      nextEpisodeId: nextEpisode?.id || null,
      prevEpisodeId: prevEpisode?.id || null
    };
  } catch (error) {
    console.error('Error fetching episode context:', error);
    return {
      ...playback,
      playlist: [],
      nextEpisodeId: null,
      prevEpisodeId: null
    };
  }
}
