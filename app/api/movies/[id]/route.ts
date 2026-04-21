import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';
import fs from 'fs';

/**
 * GET /api/movies/[id]
 * Access single registry entity
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId);

    if (!movie) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ movie });
  } catch (error) {
    return NextResponse.json({ error: 'Uplink failed' }, { status: 500 });
  }
}

/**
 * PATCH /api/movies/[id]
 * Direct Registry Override
 */
export const PATCH = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const body = await request.json();
    const db = getDb();

    // Standard metadata + Advanced identity fields
    const fields = ['title', 'year', 'quality', 'plot', 'rating', 'genres', 'director', 'language', 'runtime', 'thumbnail', 'audience'];
    const updates: string[] = [];
    const values: any[] = [];

    fields.forEach(field => {
      if (body[field] !== undefined) {
        updates.push(field + " = ?");
        values.push(body[field]);
      }
    });

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No data to override' }, { status: 400 });
    }

    values.push(movieId);
    db.prepare("UPDATE movies SET " + updates.join(', ') + ", updated_at = datetime('now') WHERE id = ?").run(...values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Override failed: ' + error.message }, { status: 500 });
  }
});

/**
 * DELETE /api/movies/[id]
 * Registry Purge
 */
export const DELETE = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();

    const body = await request.json().catch(() => ({})) as { deleteFiles?: boolean };

    if (body.deleteFiles) {
      // Collect paths shared with other movies — never delete those
      const sharedPaths = new Set<string>(
        (db.prepare('SELECT DISTINCT path FROM files WHERE movie_id != ?').all(movieId) as { path: string }[])
          .map(r => r.path)
      );

      const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
      const subs  = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];

      for (const f of [...files, ...subs]) {
        if (sharedPaths.has(f.path)) continue;
        try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch {}
      }
    }

    db.prepare("DELETE FROM movie_categories WHERE movie_id = ?").run(movieId);
    db.prepare("DELETE FROM subtitles WHERE movie_id = ?").run(movieId);
    db.prepare("DELETE FROM files WHERE movie_id = ?").run(movieId);
    db.prepare("DELETE FROM movies WHERE id = ?").run(movieId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
});
