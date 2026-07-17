import { getDb } from '@/lib/db';
import { getSearchTerms } from '@/lib/search';

export function getSeriesList(options: {
  q?: string | null;
  genre?: string | null;
  year?: string | null;
  audience?: 'family' | 'adult' | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | 'rating' | 'repair' | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, genre, year, audience, sort, offset = 0, limit = 24 } = options;
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
        LOWER(s.title) LIKE LOWER(?) OR 
        LOWER(s.genres) LIKE LOWER(?) OR 
        LOWER(s.director) LIKE LOWER(?) OR
        LOWER(s.plot) LIKE LOWER(?)
        ${isYear ? 'OR s.year = ?' : ''}
      )`);
      
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
      if (isYear) params.push(parseInt(term));

      relevanceSql += ` + (
        CASE WHEN LOWER(s.title) LIKE LOWER(?) THEN 10 ELSE 0 END +
        CASE WHEN LOWER(s.genres) LIKE LOWER(?) THEN 5 ELSE 0 END +
        CASE WHEN LOWER(s.director) LIKE LOWER(?) THEN 3 ELSE 0 END +
        CASE WHEN LOWER(s.plot) LIKE LOWER(?) THEN 2 ELSE 0 END
        ${isYear ? '+ CASE WHEN s.year = ? THEN 15 ELSE 0 END' : ''}
      )`;
      
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
      if (isYear) params.push(parseInt(term));
    });
  }

  let seriesQuery = `
    SELECT s.id, s.title, s.year, s.thumbnail, s.genres, s.rating, s.audience, s.needs_repair,
           (${relevanceSql}) as search_relevance,
           (SELECT COUNT(*) FROM seasons WHERE series_id = s.id) as season_count
    FROM series s
  `;

  if (genre) {
    whereConditions.push('s.genres LIKE ?');
    params.push(`%${genre}%`);
  }

  if (year) {
    whereConditions.push('s.year = ?');
    params.push(parseInt(year));
  }

  if (audience) {
    whereConditions.push('s.audience = ?');
    params.push(audience);
  }

  if (whereConditions.length > 0) {
    seriesQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  if (sort === 'title_desc') {
    seriesQuery += ' ORDER BY search_relevance DESC, s.title DESC, s.id DESC';
  } else if (sort === 'newest') {
    seriesQuery += ' ORDER BY search_relevance DESC, s.id DESC';
  } else if (sort === 'rating') {
    seriesQuery += ' ORDER BY search_relevance DESC, s.rating DESC, s.title ASC';
  } else if (sort === 'repair') {
    seriesQuery += ' ORDER BY s.needs_repair DESC, s.title ASC';
  } else {
    seriesQuery += ' ORDER BY search_relevance DESC, s.title ASC, s.id ASC';
  }
  
  try {
    const totalQuery = `SELECT COUNT(*) as count FROM (${seriesQuery})`;
    const { count: total } = db.prepare(totalQuery).get(...params) as { count: number };

    seriesQuery += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const series = db.prepare(seriesQuery).all(...params) as any[];

    return {
      series,
      total
    };
  } catch (error: any) {
    if (error.message.includes('no such table')) {
        return { series: [], total: 0 };
    }
    throw error;
  }
}
