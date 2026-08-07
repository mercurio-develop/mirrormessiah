import { getDb } from '@/lib/db';

export function getEpisodesByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const rows = db.prepare(`
      SELECT e.id, e.title, e.episode_number, e.thumbnail,
             s.season_number, s.series_id, ser.title as series_title
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      JOIN series ser ON s.series_id = ser.id
      WHERE e.id IN (${placeholders})
    `).all(...ids) as Record<string, unknown>[];
    const byId = new Map(rows.map((row) => [row.id as number, row]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) return [];
    throw error;
  }
}
