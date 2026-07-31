'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function deleteCourseAction(
  courseIds: number[],
  options: { deleteFiles?: boolean; deleteDirectory?: boolean } = {},
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    let purgedCount = 0;

    for (const courseId of courseIds) {
      const files = db.prepare(`
        SELECT lf.path FROM lesson_files lf
        JOIN lessons l ON lf.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ?
      `).all(courseId) as { path: string }[];

      const subs = db.prepare(`
        SELECT ls.path FROM lesson_subtitles ls
        JOIN lessons l ON ls.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ?
      `).all(courseId) as { path: string }[];

      if (options.deleteFiles || options.deleteDirectory) {
        if (options.deleteFiles && !options.deleteDirectory) {
          for (const f of [...files, ...subs]) {
            try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ignore */ }
          }
        }
        if (options.deleteDirectory && files.length > 0) {
          const courseDir = path.dirname(path.dirname(files[0].path));
          try { if (fs.existsSync(courseDir)) fs.rmSync(courseDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }

      db.prepare(`DELETE FROM lesson_subtitles WHERE lesson_id IN (
        SELECT l.id FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = ?
      )`).run(courseId);
      db.prepare(`DELETE FROM lesson_files WHERE lesson_id IN (
        SELECT l.id FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = ?
      )`).run(courseId);
      db.prepare(`DELETE FROM lessons WHERE module_id IN (SELECT id FROM course_modules WHERE course_id = ?)`).run(courseId);
      db.prepare('DELETE FROM course_modules WHERE course_id = ?').run(courseId);
      db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
      purgedCount++;
    }

    revalidatePath('/admin/courses');
    revalidatePath('/courses');
    return { status: 'success', message: `Purged ${purgedCount} course(s) from registry` };
  } catch (error: unknown) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: error instanceof Error ? error.message : 'Delete failed' };
  }
}
