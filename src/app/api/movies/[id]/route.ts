import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

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
    const fields = ['title', 'year', 'quality', 'plot', 'rating', 'genres', 'director', 'language', 'runtime', 'thumbnail', 'audience', 'needs_repair'];
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

    const body = await request.json().catch(() => ({})) as { deleteFiles?: boolean; deleteDirectory?: boolean };

    // 1. Identify shared resources to prevent data loss
    const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
    const subs  = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];
    
    if (body.deleteFiles || body.deleteDirectory) {
      // Find all paths in the DB linked to OTHER movies
      const allOtherPaths = new Set<string>(
        (db.prepare('SELECT path FROM files WHERE movie_id != ? UNION SELECT path FROM subtitles WHERE movie_id != ?').all(movieId, movieId) as { path: string }[])
          .map(r => r.path)
      );

      // Handle Individual Files
      if (body.deleteFiles && !body.deleteDirectory) {
        for (const f of [...files, ...subs]) {
          if (allOtherPaths.has(f.path)) continue;
          try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch {}
        }
      }

      // Handle Full Directory
      if (body.deleteDirectory && files.length > 0) {
        const movieDir = path.dirname(files[0].path);
        
        // Check if ANY file in this directory belongs to another movie in the DB
        const sharedDirEntries = db.prepare('SELECT COUNT(*) as count FROM files WHERE movie_id != ? AND path LIKE ?').get(movieId, movieDir + '%') as { count: number };
        
        if (sharedDirEntries.count === 0) {
           try {
             if (fs.existsSync(movieDir)) {
               // Use recursive delete for the directory
               fs.rmSync(movieDir, { recursive: true, force: true });
             }
           } catch (e) {
             console.error(`Failed to delete directory: ${movieDir}`, e);
           }
        }
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
