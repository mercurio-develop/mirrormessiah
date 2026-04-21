import { getDb } from '@/lib/db';

export function getMovies(options: {
  q?: string | null;
  genre?: string | null;
  quality?: string | null;
  year?: string | null;
  audience?: 'family' | 'adult' | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, genre, quality, year, audience, sort, offset = 0, limit = 24 } = options;
  const db = getDb();
  
  const params: any[] = [];
  const whereConditions: string[] = [];

  let movieQuery = `
    SELECT m.id, m.title, m.year, m.quality, m.thumbnail, m.genres, m.rating, m.audience
    FROM movies m
  `;

  if (q) {
    const searchTerms = q.trim().split(/\s+/);
    searchTerms.forEach(term => {
      whereConditions.push(`(
        LOWER(m.title) LIKE LOWER(?) OR 
        LOWER(m.genres) LIKE LOWER(?) OR 
        LOWER(m.director) LIKE LOWER(?) OR
        LOWER(m.plot) LIKE LOWER(?)
      )`);
      const likeTerm = `%${term}%`;
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
    });
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

  if (audience) {
    whereConditions.push('m.audience = ?');
    params.push(audience);
  }

  if (whereConditions.length > 0) {
    movieQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  if (sort === 'title_desc') {
    movieQuery += ' ORDER BY m.title DESC, m.id DESC';
  } else if (sort === 'newest') {
    movieQuery += ' ORDER BY m.id DESC';
  } else {
    movieQuery += ' ORDER BY m.title ASC, m.id ASC';
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
