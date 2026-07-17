import { getDb } from '@/lib/db';
import { getSearchTerms } from '@/lib/search';

export function getMovies(options: {
  q?: string | null;
  genre?: string | null;
  quality?: string | null;
  year?: string | null;
  audience?: 'family' | 'adult' | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | 'rating' | 'repair' | null;
  hasThumbnail?: boolean | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, genre, quality, year, audience, sort, hasThumbnail, offset = 0, limit = 24 } = options;
  const db = getDb();
  
  const params: any[] = [];
  const whereConditions: string[] = [];
  let relevanceSql = '0';

  if (q) {
    const searchTerms = getSearchTerms(q);
    searchTerms.forEach(term => {
      const isYear = /^\d{4}$/.test(term);
      const likeTerm = `%${term}%`;
      
      whereConditions.push(`(
        LOWER(m.title) LIKE LOWER(?) OR 
        LOWER(m.genres) LIKE LOWER(?) OR 
        LOWER(m.director) LIKE LOWER(?) OR
        LOWER(m.plot) LIKE LOWER(?)
        ${isYear ? 'OR m.year = ?' : ''}
      )`);
      
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
      if (isYear) params.push(parseInt(term));

      // Build relevance score
      relevanceSql += ` + (
        CASE WHEN LOWER(m.title) LIKE LOWER(?) THEN 10 ELSE 0 END +
        CASE WHEN LOWER(m.genres) LIKE LOWER(?) THEN 5 ELSE 0 END +
        CASE WHEN LOWER(m.director) LIKE LOWER(?) THEN 3 ELSE 0 END +
        CASE WHEN LOWER(m.plot) LIKE LOWER(?) THEN 2 ELSE 0 END
        ${isYear ? '+ CASE WHEN m.year = ? THEN 15 ELSE 0 END' : ''}
      )`;
      
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
      if (isYear) params.push(parseInt(term));
    });
  }

  let movieQuery = `
    SELECT m.id, m.title, m.year, m.quality, m.thumbnail, m.genres, m.rating, m.audience, m.needs_repair,
           (${relevanceSql}) as search_relevance,
           EXISTS(SELECT 1 FROM subtitles WHERE movie_id = m.id) as has_subtitles
    FROM movies m
  `;

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

  if (hasThumbnail === true) {
    whereConditions.push('m.thumbnail IS NOT NULL AND m.thumbnail != "" AND m.thumbnail != "null" AND m.thumbnail != "undefined"');
  } else if (hasThumbnail === false) {
    whereConditions.push('(m.thumbnail IS NULL OR m.thumbnail = "" OR m.thumbnail = "null" OR m.thumbnail = "undefined")');
  }

  if (whereConditions.length > 0) {
    movieQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  if (sort === 'title_desc') {
    movieQuery += ' ORDER BY search_relevance DESC, m.title DESC, m.id DESC';
  } else if (sort === 'newest') {
    movieQuery += ' ORDER BY search_relevance DESC, m.id DESC';
  } else if (sort === 'rating') {
    movieQuery += ' ORDER BY search_relevance DESC, m.rating DESC, m.title ASC';
  } else if (sort === 'repair') {
    movieQuery += ' ORDER BY m.needs_repair DESC, m.title ASC';
  } else {
    movieQuery += ' ORDER BY search_relevance DESC, m.title ASC, m.id ASC';
  }
  
  try {
    const totalQuery = `SELECT COUNT(*) as count FROM (${movieQuery})`;
    const { count: total } = db.prepare(totalQuery).get(...params) as { count: number };

    movieQuery += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const movies = db.prepare(movieQuery).all(...params) as any[];

    return {
      movies,
      total
    };
  } catch (error: any) {
    // Graceful fallback for empty/uninitialized DB
    if (error.message.includes('no such table')) {
        return { movies: [], total: 0 };
    }
    throw error;
  }
}
