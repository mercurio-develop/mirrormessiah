import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { resolveCourseDir } from '@/features/course/lib/local-artwork';

const MODULE_PREFIX: Record<string, string> = {
  week: 'Week',
  chapter: 'Chapter',
  section: 'Section',
};

export function lessonThumbPath(
  courseDir: string,
  moduleNum: number,
  moduleKind: string,
  lessonNum: number,
  title: string,
): string {
  const prefix = MODULE_PREFIX[moduleKind] || 'Module';
  const modDir = path.join(courseDir, `${prefix} ${moduleNum.toString().padStart(2, '0')}`);
  const clean = (title || `Lesson ${lessonNum}`).replace(/[<>:"/\\|?*]/g, '_').trim();
  if (clean.toLowerCase().startsWith('lesson ')) {
    return path.join(modDir, `L${lessonNum.toString().padStart(2, '0')}-thumb.jpg`);
  }
  return path.join(modDir, `L${lessonNum.toString().padStart(2, '0')} - ${clean}-thumb.jpg`);
}

export function thumbnailIsAvailable(
  thumbnail: string | null,
  courseDir: string | null,
  moduleNum: number,
  moduleKind: string,
  lessonNum: number,
  title: string,
): boolean {
  if (thumbnail) {
    if (thumbnail.startsWith('http')) return true;
    if (fs.existsSync(thumbnail)) return true;
  }
  if (courseDir) {
    const guess = lessonThumbPath(courseDir, moduleNum, moduleKind, lessonNum, title);
    if (fs.existsSync(guess)) return true;
  }
  return false;
}

export interface ScrapeLessonThumbnailsResult {
  generated: number;
  skipped: number;
  failed: number;
  total: number;
}

/** Count lessons missing thumbnails under the course library root. */
export function countMissingLessonThumbnails(
  db: Database.Database,
  coursesRoot: string,
): { total: number; missing: number } {
  const prefix = path.resolve(coursesRoot) + path.sep;
  const rows = db.prepare(`
    SELECT l.id, l.lesson_number, l.title, l.thumbnail, m.module_number, m.module_kind, c.id AS course_id
    FROM lessons l
    JOIN course_modules m ON l.module_id = m.id
    JOIN courses c ON m.course_id = c.id
    WHERE EXISTS (
      SELECT 1 FROM lesson_files lf
      WHERE lf.lesson_id = l.id AND lf.path LIKE ?
    )
  `).all(`${prefix}%`) as {
    id: number;
    lesson_number: number;
    title: string | null;
    thumbnail: string | null;
    module_number: number;
    module_kind: string;
    course_id: number;
  }[];

  let missing = 0;
  for (const row of rows) {
    const courseDir = resolveCourseDir(db, row.course_id);
    const title = row.title || `Lesson ${row.lesson_number}`;
    if (!thumbnailIsAvailable(row.thumbnail, courseDir, row.module_number, row.module_kind, row.lesson_number, title)) {
      missing += 1;
    }
  }
  return { total: rows.length, missing };
}
