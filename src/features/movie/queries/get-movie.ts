import { getDb } from '@/lib/db';

export function getMovie(id: number) {
  const db = getDb();
  // Ensure we select all potential metadata fields
  return db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as any;
}
