import { getDb } from '@/lib/db';
import { getLessonPlayback } from './get-lesson-playback';

export function getLessonContext(id: number) {
  const playback = getLessonPlayback(id);
  if (!playback) return null;

  const db = getDb();
  const { lesson } = playback;

  try {
    const playlist = db.prepare(`
      SELECT l.id, l.title, l.lesson_number, l.thumbnail, l.runtime,
             EXISTS(SELECT 1 FROM lesson_files WHERE lesson_id = l.id) as has_file
      FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ? AND m.module_number = ?
      ORDER BY l.lesson_number ASC
    `).all(lesson.course_id, lesson.module_number) as Record<string, unknown>[];

    let nextLesson = db.prepare(`
      SELECT l.id FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ? AND m.module_number = ? AND l.lesson_number > ?
      ORDER BY l.lesson_number ASC LIMIT 1
    `).get(lesson.course_id, lesson.module_number, lesson.lesson_number) as { id: number } | undefined;

    if (!nextLesson) {
      nextLesson = db.prepare(`
        SELECT l.id FROM lessons l
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ? AND m.module_number > ?
        ORDER BY m.module_number ASC, l.lesson_number ASC LIMIT 1
      `).get(lesson.course_id, lesson.module_number) as { id: number } | undefined;
    }

    let prevLesson = db.prepare(`
      SELECT l.id FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ? AND m.module_number = ? AND l.lesson_number < ?
      ORDER BY l.lesson_number DESC LIMIT 1
    `).get(lesson.course_id, lesson.module_number, lesson.lesson_number) as { id: number } | undefined;

    if (!prevLesson) {
      prevLesson = db.prepare(`
        SELECT l.id FROM lessons l
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ? AND m.module_number < ?
        ORDER BY m.module_number DESC, l.lesson_number DESC LIMIT 1
      `).get(lesson.course_id, lesson.module_number) as { id: number } | undefined;
    }

    return {
      ...playback,
      playlist,
      nextLessonId: nextLesson?.id ?? null,
      prevLessonId: prevLesson?.id ?? null,
    };
  } catch {
    return { ...playback, playlist: [], nextLessonId: null, prevLessonId: null };
  }
}
