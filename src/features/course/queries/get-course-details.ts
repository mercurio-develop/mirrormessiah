import { getDb } from '@/lib/db';

export interface CourseLesson {
  id: number;
  module_id: number;
  lesson_number: number;
  title: string | null;
  plot: string | null;
  runtime: number | null;
  thumbnail: string | null;
  has_file: number;
}

export interface CourseModule {
  id: number;
  course_id: number;
  module_number: number;
  module_kind: string;
  title: string | null;
  plot: string | null;
  poster: string | null;
  lessons: CourseLesson[];
}

export interface CourseDetails {
  id: number;
  title: string;
  year: number | null;
  plot: string | null;
  rating: number | null;
  thumbnail: string | null;
  platform: string | null;
  category: string | null;
  instructor: string | null;
  language: string | null;
  needs_repair: number;
  modules: CourseModule[];
}

export function getCourseDetails(id: number): CourseDetails | null {
  const db = getDb();
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as CourseDetails | undefined;
    if (!course) return null;

    const modules = db.prepare(
      'SELECT * FROM course_modules WHERE course_id = ? ORDER BY module_number ASC',
    ).all(id) as CourseModule[];

    const allLessons = db.prepare(`
      SELECT l.*,
             EXISTS(SELECT 1 FROM lesson_files WHERE lesson_id = l.id) as has_file
      FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
      ORDER BY m.module_number ASC, l.lesson_number ASC
    `).all(id) as CourseLesson[];

    const lessonsByModule = allLessons.reduce<Record<number, CourseLesson[]>>((acc, lesson) => {
      if (!acc[lesson.module_id]) acc[lesson.module_id] = [];
      acc[lesson.module_id].push(lesson);
      return acc;
    }, {});

    return {
      ...course,
      modules: modules.map((m) => ({
        ...m,
        lessons: lessonsByModule[m.id] || [],
      })),
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) return null;
    throw error;
  }
}
