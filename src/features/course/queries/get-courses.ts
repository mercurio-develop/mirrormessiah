import { getDb } from '@/lib/db';
import { getSearchTerms } from '@/lib/search';

export function getCoursesList(options: {
  q?: string | null;
  platform?: string | null;
  category?: string | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | 'repair' | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, platform, category, sort, offset = 0, limit = 24 } = options;
  const db = getDb();
  const params: unknown[] = [];
  const whereConditions: string[] = [];
  let relevanceSql = '0';

  if (q) {
    const searchTerms = getSearchTerms(q);
    searchTerms.forEach((term) => {
      const likeTerm = `%${term}%`;
      whereConditions.push(`(
        LOWER(c.title) LIKE LOWER(?) OR
        LOWER(c.platform) LIKE LOWER(?) OR
        LOWER(c.category) LIKE LOWER(?) OR
        LOWER(c.instructor) LIKE LOWER(?) OR
        LOWER(c.plot) LIKE LOWER(?)
      )`);
      params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      relevanceSql += ` + (
        CASE WHEN LOWER(c.title) LIKE LOWER(?) THEN 10 ELSE 0 END +
        CASE WHEN LOWER(c.platform) LIKE LOWER(?) THEN 5 ELSE 0 END +
        CASE WHEN LOWER(c.category) LIKE LOWER(?) THEN 4 ELSE 0 END +
        CASE WHEN LOWER(c.plot) LIKE LOWER(?) THEN 2 ELSE 0 END
      )`;
      params.push(likeTerm, likeTerm, likeTerm, likeTerm);
    });
  }

  let query = `
    SELECT c.id, c.title, c.year, c.thumbnail, c.platform, c.category, c.instructor, c.language, c.needs_repair,
           (${relevanceSql}) as search_relevance,
           (SELECT COUNT(*) FROM course_modules WHERE course_id = c.id) as module_count
    FROM courses c
  `;

  if (platform) {
    whereConditions.push('c.platform = ?');
    params.push(platform);
  }

  if (category) {
    whereConditions.push('c.category = ?');
    params.push(category);
  }

  if (whereConditions.length > 0) {
    query += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  if (sort === 'title_desc') {
    query += ' ORDER BY search_relevance DESC, c.title DESC, c.id DESC';
  } else if (sort === 'newest') {
    query += ' ORDER BY search_relevance DESC, c.id DESC';
  } else if (sort === 'repair') {
    query += ' ORDER BY c.needs_repair DESC, c.title ASC';
  } else {
    query += ' ORDER BY search_relevance DESC, c.title ASC, c.id ASC';
  }

  try {
    const totalQuery = `SELECT COUNT(*) as count FROM (${query})`;
    const { count: total } = db.prepare(totalQuery).get(...params) as { count: number };
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const courses = db.prepare(query).all(...params) as Record<string, unknown>[];
    return { courses, total };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) {
      return { courses: [], total: 0 };
    }
    throw error;
  }
}

export function getCourseFacets() {
  const db = getDb();
  try {
    const platforms = db.prepare(`
      SELECT DISTINCT platform FROM courses
      WHERE platform IS NOT NULL AND platform != ''
      ORDER BY platform ASC
    `).all() as { platform: string }[];
    const categories = db.prepare(`
      SELECT DISTINCT category FROM courses
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category ASC
    `).all() as { category: string }[];
    return {
      platforms: platforms.map((row) => row.platform),
      categories: categories.map((row) => row.category),
    };
  } catch {
    return { platforms: [], categories: [] };
  }
}
