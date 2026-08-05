import { getDb } from '@/lib/db';
import { getMimeType } from '@/lib/pathenc';
import { b64urlEncode } from '@/lib/b64url';
import { buildSubtitleTracks } from '@/lib/subtitle-tracks';
import fs from 'fs';

function pickBestFile(db: ReturnType<typeof getDb>, lessonId: number) {
  const queries = [
    `SELECT path, mime_type FROM lesson_files WHERE lesson_id = ? AND lower(path) LIKE '%.mp4' AND path NOT LIKE '%x265%' AND path NOT LIKE '%HEVC%' LIMIT 1`,
    `SELECT path, mime_type FROM lesson_files WHERE lesson_id = ? AND lower(path) LIKE '%.mp4' LIMIT 1`,
    `SELECT path, mime_type FROM lesson_files WHERE lesson_id = ? AND lower(path) LIKE '%.mkv' LIMIT 1`,
    `SELECT path, mime_type FROM lesson_files WHERE lesson_id = ? LIMIT 1`,
  ];
  for (const sql of queries) {
    const row = db.prepare(sql).get(lessonId) as { path: string; mime_type: string | null } | undefined;
    if (row) return row;
  }
  return undefined;
}

export function getLessonPlayback(id: number) {
  const db = getDb();
  try {
    const lesson = db.prepare(`
      SELECT l.id, l.title, l.lesson_number, l.plot, l.runtime, l.thumbnail,
             m.module_number, m.module_kind, m.course_id, c.title as course_title, c.thumbnail as course_thumbnail
      FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      JOIN courses c ON m.course_id = c.id
      WHERE l.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!lesson) return null;

    const bestFile = pickBestFile(db, id);
    if (!bestFile) return null;

    const actualMime = getMimeType(bestFile.path);

    let subtitles = db.prepare(`
      SELECT path, lang, label, format FROM lesson_subtitles WHERE lesson_id = ?
      ORDER BY lang ASC, path ASC
    `).all(id) as { path: string; lang: string | null; label: string | null; format: string | null }[];

    subtitles = subtitles.filter((s) => fs.existsSync(s.path));
    const uniqueSubs = buildSubtitleTracks(subtitles);

    return {
      source: { type: 'file' as const, src: `/api/stream?path=${b64urlEncode(bestFile.path)}&v=${Date.now()}` },
      mimeType: actualMime,
      subtitles: uniqueSubs,
      lesson: {
        id,
        course_id: lesson.course_id,
        title: lesson.title,
        course_title: lesson.course_title,
        course_thumbnail: lesson.course_thumbnail,
        module_number: lesson.module_number,
        module_kind: lesson.module_kind,
        lesson_number: lesson.lesson_number,
        plot: lesson.plot,
        runtime: lesson.runtime,
        thumbnail: lesson.thumbnail,
      },
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('no such table')) return null;
    throw e;
  }
}
