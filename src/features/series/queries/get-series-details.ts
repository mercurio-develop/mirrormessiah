import { getDb } from '@/lib/db';

export function getSeriesDetails(id: number) {
  const db = getDb();
  
  try {
    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any;
    if (!series) return null;

    const seasons = db.prepare('SELECT * FROM seasons WHERE series_id = ? ORDER BY season_number ASC').all(id) as any[];
    
    // Get episodes for all seasons, organized by season_id
    const allEpisodes = db.prepare(`
      SELECT e.*, 
             EXISTS(SELECT 1 FROM episode_files WHERE episode_id = e.id) as has_file
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      WHERE s.series_id = ?
      ORDER BY e.season_id ASC, e.episode_number ASC
    `).all(id) as any[];

    const episodesBySeason = allEpisodes.reduce((acc, ep) => {
      if (!acc[ep.season_id]) acc[ep.season_id] = [];
      acc[ep.season_id].push(ep);
      return acc;
    }, {} as Record<number, any[]>);

    return {
      ...series,
      seasons: seasons.map(s => ({
        ...s,
        episodes: episodesBySeason[s.id] || []
      }))
    };
  } catch (error: any) {
    if (error.message.includes('no such table')) return null;
    throw error;
  }
}
