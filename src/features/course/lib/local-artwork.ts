import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

function resolveCourseRoot(libraryRoot: string, filePath: string): string {
  const rel = path.relative(path.resolve(libraryRoot), path.resolve(filePath));
  const top = rel.split(path.sep)[0];
  return path.join(path.resolve(libraryRoot), top);
}

export function resolveCourseDir(db: Database.Database, courseId: number): string | null {
  const row = db.prepare(`
    SELECT lib.root_path, lf.path, c.title, c.platform
    FROM courses c
    JOIN libraries lib ON c.library_id = lib.id
    LEFT JOIN course_modules m ON m.course_id = c.id
    LEFT JOIN lessons l ON l.module_id = m.id
    LEFT JOIN lesson_files lf ON lf.lesson_id = l.id
    WHERE c.id = ?
    LIMIT 1
  `).get(courseId) as {
    root_path: string;
    path: string | null;
    title: string;
    platform: string | null;
  } | undefined;

  if (!row) return null;

  if (row.path) {
    const root = resolveCourseRoot(row.root_path, row.path);
    if (fs.existsSync(root)) return root;
  }

  const safeTitle = row.title.replace(/[<>:"/\\|?*]/g, '_').trim();
  const folderName = row.platform?.trim() ? `${row.platform} - ${safeTitle}` : safeTitle;
  const candidate = path.join(path.resolve(row.root_path), folderName);
  if (fs.existsSync(candidate)) return candidate;

  return null;
}

export function discoverLocalArtwork(
  db: Database.Database,
  courseId: number,
  courseDir: string,
  currentThumbnail: string | null,
): void {
  const poster = path.join(courseDir, 'poster.jpg');
  if (fs.existsSync(poster) && !currentThumbnail) {
    db.prepare('UPDATE courses SET thumbnail = ? WHERE id = ?').run(poster, courseId);
  }

  const modules = db.prepare(
    'SELECT id, module_number, poster FROM course_modules WHERE course_id = ?',
  ).all(courseId) as { id: number; module_number: number; poster: string | null }[];

  for (const mod of modules) {
    if (mod.poster) continue;
    const modPoster = path.join(courseDir, `Module ${mod.module_number.toString().padStart(2, '0')}`, 'poster.jpg');
    const weekPoster = path.join(courseDir, `Week ${mod.module_number.toString().padStart(2, '0')}`, 'poster.jpg');
    if (fs.existsSync(modPoster)) {
      db.prepare('UPDATE course_modules SET poster = ? WHERE id = ?').run(modPoster, mod.id);
    } else if (fs.existsSync(weekPoster)) {
      db.prepare('UPDATE course_modules SET poster = ? WHERE id = ?').run(weekPoster, mod.id);
    }
  }

  const lessons = db.prepare(`
    SELECT l.id, l.lesson_number, l.title, l.thumbnail, m.module_number
    FROM lessons l
    JOIN course_modules m ON l.module_id = m.id
    WHERE m.course_id = ?
  `).all(courseId) as {
    id: number;
    lesson_number: number;
    title: string | null;
    thumbnail: string | null;
    module_number: number;
  }[];

  for (const les of lessons) {
    if (les.thumbnail && fs.existsSync(les.thumbnail)) continue;
    const sn = les.module_number.toString().padStart(2, '0');
    const ln = les.lesson_number.toString().padStart(2, '0');
    const candidates = [
      path.join(courseDir, `Week ${sn}`, `L${ln}-thumb.jpg`),
      path.join(courseDir, `Module ${sn}`, `L${ln}-thumb.jpg`),
      path.join(courseDir, `Week ${sn}`, `L${ln} - ${les.title || ''}-thumb.jpg`.replace(/ - -thumb/, '-thumb')),
    ];
    for (const thumb of candidates) {
      if (fs.existsSync(thumb)) {
        db.prepare('UPDATE lessons SET thumbnail = ? WHERE id = ?').run(thumb, les.id);
        break;
      }
    }
  }
}
