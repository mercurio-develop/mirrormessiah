import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Normalize title: lowercase, strip punctuation, collapse spaces
const NORMALIZE = `
  TRIM(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      LOWER(title),
    '.', ''), '-', ' '), ':', ''), '!', ''), '?', ''), '''', ''), '  ', ' ')
  )
`;

export const GET = withAdminAuth(async (request: Request) => {
  try {
    const db = getDb();

    const duplicates = db.prepare(`
      SELECT
        ${NORMALIZE} as normalized_title,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id ASC) as ids,
        GROUP_CONCAT(title ORDER BY id ASC) as titles,
        GROUP_CONCAT(COALESCE(year, '?') ORDER BY id ASC) as years,
        GROUP_CONCAT(COALESCE(quality, '?') ORDER BY id ASC) as qualities,
        GROUP_CONCAT(COALESCE(thumbnail, '') ORDER BY id ASC) as thumbnails
      FROM movies
      GROUP BY ${NORMALIZE}, COALESCE(year, 0)
      HAVING COUNT(*) > 1
      ORDER BY count DESC, normalized_title ASC
    `).all() as any[];

    return NextResponse.json({ duplicates, total: duplicates.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const DELETE = withAdminAuth(async (request: Request) => {
  try {
    const { ids, deleteFiles } = await request.json() as { ids: number[]; deleteFiles: boolean };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const db = getDb();
    const filesDeleted: string[] = [];
    const fileErrors: string[] = [];

    const deleteMovie = db.transaction((id: number) => {
      if (deleteFiles) {
        const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(id) as { path: string }[];
        const subtitleFiles = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(id) as { path: string }[];

        for (const f of [...files, ...subtitleFiles]) {
          try {
            if (fs.existsSync(f.path)) {
              fs.unlinkSync(f.path);
              filesDeleted.push(f.path);
            }
          } catch (e: any) {
            fileErrors.push(f.path + ': ' + e.message);
          }
        }
      }

      db.prepare('DELETE FROM movie_categories WHERE movie_id = ?').run(id);
      db.prepare('DELETE FROM subtitles WHERE movie_id = ?').run(id);
      db.prepare('DELETE FROM files WHERE movie_id = ?').run(id);
      db.prepare('DELETE FROM movies WHERE id = ?').run(id);
    });

    for (const id of ids) {
      deleteMovie(id);
    }

    return NextResponse.json({
      success: true,
      deleted: ids.length,
      filesDeleted: filesDeleted.length,
      fileErrors,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
