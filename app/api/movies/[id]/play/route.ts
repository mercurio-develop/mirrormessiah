import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { b64urlEncode, getMimeType } from '@/lib/pathenc';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    
    const db = getDb();
    const movie = db.prepare('SELECT id, title FROM movies WHERE id = ?').get(movieId) as any;
    if (!movie) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Filter for 1080p MP4 files only
    const bestFile = db.prepare(`
      SELECT path, mime_type, size_bytes
      FROM files
      WHERE movie_id = ? 
      AND lower(path) LIKE '%.mp4'
      AND (path LIKE '%1080p%' OR path LIKE '%FHD%')
      LIMIT 1
    `).get(movieId) as { path: string; mime_type: string | null } | undefined;

    if (!bestFile) {
      return NextResponse.json({ error: 'No 1080p MP4 found' }, { status: 404 });
    }

    const subtitles = db.prepare(`
      SELECT path, lang, format FROM subtitles WHERE movie_id = ?
    `).all(movieId) as any[];

    return NextResponse.json({
      source: { type: "file", src: `/api/stream?path=${b64urlEncode(bestFile.path)}` },
      mimeType: "video/mp4",
      subtitles: subtitles.map(s => ({
        src: `/api/subtitle?path=${b64urlEncode(s.path)}`,
        srclang: s.lang || 'en',
        label: `${(s.lang || 'en').toUpperCase()}`
      })),
      movie: { id: movieId, title: movie.title }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
