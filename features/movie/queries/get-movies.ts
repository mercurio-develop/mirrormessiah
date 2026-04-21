import { getDb } from '@/lib/db';

export function getMovies(options: {
  q?: string | null;
  genre?: string | null;
  quality?: string | null;
  year?: string | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, genre, quality, year, sort, offset = 0, limit = 24 } = options;
  const db = getDb();
  
  const params: any[] = [];
  const whereConditions: string[] = [];

  let movieQuery = `
    SELECT m.id, m.title, m.year, m.quality, m.thumbnail, m.genres, m.rating
    FROM movies m
  `;

  if (q) {
    whereConditions.push('LOWER(m.title) LIKE LOWER(?)');
    params.push(`%${q}%`);
  }

  if (genre) {
    whereConditions.push('m.genres LIKE ?');
    params.push(`%${genre}%`);
  }

  if (quality) {
    whereConditions.push('m.quality LIKE ?');
    params.push(`%${quality}%`);
  }

  if (year) {
    whereConditions.push('m.year = ?');
    params.push(parseInt(year));
  }

  if (whereConditions.length > 0) {
    movieQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  if (sort === 'title_desc') {
    movieQuery += ' ORDER BY m.title DESC';
  } else if (sort === 'newest') {
    movieQuery += ' ORDER BY m.id DESC';
  } else {
    movieQuery += ' ORDER BY m.title ASC';
  }
  
  const totalQuery = `SELECT COUNT(*) as count FROM (${movieQuery})`;
  const { count: total } = db.prepare(totalQuery).get(...params) as { count: number };

  movieQuery += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const movies = db.prepare(movieQuery).all(...params) as any[];

  return {
    movies,
    total
  };
}
