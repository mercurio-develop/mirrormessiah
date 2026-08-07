import { getDb } from '@/lib/db';
import { getSearchTerms } from '@/lib/search';
import { DEFAULT_COURSE_SORT } from '@/features/course/search-params';

export type CourseCategoryCounts = {
  total: number;
  byCategory: Record<string, number>;
};

function appendSearchFilters(q: string, whereConditions: string[], params: unknown[]) {
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
  });
}

function appendSearchRelevance(q: string, relevanceSql: string, params: unknown[]) {
  let sql = relevanceSql;
  const searchTerms = getSearchTerms(q);
  searchTerms.forEach((term) => {
    const likeTerm = `%${term}%`;
    sql += ` + (
      CASE WHEN LOWER(c.title) LIKE LOWER(?) THEN 10 ELSE 0 END +
      CASE WHEN LOWER(c.platform) LIKE LOWER(?) THEN 5 ELSE 0 END +
      CASE WHEN LOWER(c.category) LIKE LOWER(?) THEN 4 ELSE 0 END +
      CASE WHEN LOWER(c.plot) LIKE LOWER(?) THEN 2 ELSE 0 END
    )`;
    params.push(likeTerm, likeTerm, likeTerm, likeTerm);
  });
  return sql;
}

export function getCourseCategoryCounts(options: {
  q?: string | null;
  platform?: string | null;
  category?: string | null;
  year?: string | null;
} = {}): CourseCategoryCounts {
  const { q, platform, category, year } = options;
  const db = getDb();
  const params: unknown[] = [];
  const whereConditions: string[] = [];

  if (q) appendSearchFilters(q, whereConditions, params);
  if (platform) {
    whereConditions.push('c.platform = ?');
    params.push(platform);
  }
  if (category) {
    if (category === 'Uncategorized') {
      whereConditions.push("(c.category IS NULL OR c.category = '')");
    } else {
      whereConditions.push('c.category = ?');
      params.push(category);
    }
  }
  if (year) {
    whereConditions.push('c.year = ?');
    params.push(parseInt(year, 10));
  }

  const where = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  try {
    const { count: total } = db.prepare(`SELECT COUNT(*) as count FROM courses c ${where}`).get(...params) as { count: number };
    const rows = db.prepare(`
      SELECT COALESCE(NULLIF(c.category, ''), 'Uncategorized') as category, COUNT(*) as count
      FROM courses c
      ${where}
      GROUP BY COALESCE(NULLIF(c.category, ''), 'Uncategorized')
      ORDER BY count DESC, category ASC
    `).all(...params) as { category: string; count: number }[];

    const byCategory: Record<string, number> = {};
    for (const row of rows) {
      byCategory[row.category] = row.count;
    }
    return { total, byCategory };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) {
      return { total: 0, byCategory: {} };
    }
    throw error;
  }
}

export function getCoursesByIds(ids: number[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const rows = db.prepare(`
      SELECT c.id, c.title, c.year, c.thumbnail, c.platform, c.category, c.instructor, c.language, c.needs_repair,
             (SELECT COUNT(*) FROM course_modules WHERE course_id = c.id) as module_count
      FROM courses c
      WHERE c.id IN (${placeholders})
    `).all(...ids) as Record<string, unknown>[];
    const byId = new Map(rows.map((row) => [row.id as number, row]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) return [];
    throw error;
  }
}

export function getCoursesList(options: {
  q?: string | null;
  platform?: string | null;
  category?: string | null;
  year?: string | null;
  sort?: 'newest' | 'title_asc' | 'title_desc' | 'repair' | null;
  offset?: number;
  limit?: number;
} = {}) {
  const { q, platform, category, year, sort = DEFAULT_COURSE_SORT, offset = 0, limit = 24 } = options;
  const db = getDb();
  const params: unknown[] = [];
  const whereConditions: string[] = [];
  let relevanceSql = '0';

  if (q) {
    appendSearchFilters(q, whereConditions, params);
    relevanceSql = appendSearchRelevance(q, relevanceSql, params);
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
    if (category === 'Uncategorized') {
      whereConditions.push("(c.category IS NULL OR c.category = '')");
    } else {
      whereConditions.push('c.category = ?');
      params.push(category);
    }
  }

  if (year) {
    whereConditions.push('c.year = ?');
    params.push(parseInt(year, 10));
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
    const categoryCounts = getCourseCategoryCounts({ q, platform, category, year });
    const facets = getCourseFacets();
    return { courses, total, categoryCounts, facets };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) {
      return { courses: [], total: 0, categoryCounts: { total: 0, byCategory: {} }, facets: { platforms: [], categories: [], years: [] } };
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
    const years = db.prepare(`
      SELECT DISTINCT year FROM courses
      WHERE year IS NOT NULL
      ORDER BY year DESC
    `).all() as { year: number }[];
    return {
      platforms: platforms.map((row) => row.platform),
      categories: categories.map((row) => row.category),
      years: years.map((row) => String(row.year)),
    };
  } catch {
    return { platforms: [], categories: [], years: [] };
  }
}
