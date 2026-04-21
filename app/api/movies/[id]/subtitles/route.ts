import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = getDb();
  const subtitles = db.prepare(
    'SELECT id, path, lang, label, format, default_flag FROM subtitles WHERE movie_id = ? ORDER BY id'
  ).all(movieId);

  return NextResponse.json({ subtitles });
}

export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const { path: filePath, lang, label } = body as { path: string; lang?: string; label?: string };

  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 });
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });

  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext !== 'srt' && ext !== 'vtt') {
    return NextResponse.json({ error: 'Only .srt and .vtt supported' }, { status: 400 });
  }

  const db = getDb();
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
  if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 });

  try {
    const result = db.prepare(
      'INSERT OR IGNORE INTO subtitles (movie_id, path, lang, label, format, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(movieId, filePath, lang || null, label || null, ext, fs.statSync(filePath).size);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Subtitle already registered' }, { status: 409 });
    }

    return NextResponse.json({ id: result.lastInsertRowid, path: filePath, lang, label, format: ext });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
