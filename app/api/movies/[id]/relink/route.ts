import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import path from 'path';

/**
 * POST /api/movies/[id]/relink
 * Adds or updates a file link for a movie
 */
export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Security check
    const isValid = await validateFilePath(filePath);
    if (!isValid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const db = getDb();
    
    // Get library ID from the directory
    const movieDir = path.dirname(filePath);
    const library = db.prepare('SELECT id FROM libraries WHERE ? LIKE /*turbopackIgnore: true*/ root_path || "%" LIMIT 1').get(filePath) as { id: number } | undefined;
    
    if (!library) {
        return NextResponse.json({ error: 'File is not within any registered library' }, { status: 400 });
    }

    const ext = path.extname(filePath).toLowerCase();
    
    // Upsert into files table
    db.prepare(`
      INSERT INTO files (library_id, movie_id, path, container)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        movie_id = excluded.movie_id
    `).run(library.id, movieId, filePath, ext.substring(1));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Relink error:', error);
    return NextResponse.json({ error: 'Relink failed: ' + error.message }, { status: 500 });
  }
});
