import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/movies/[id]/subtitles
 * List all subtitles associated with a movie
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const db = getDb();
    const subtitles = db.prepare(
      'SELECT id, path, lang, label, format, default_flag FROM subtitles WHERE movie_id = ? ORDER BY id'
    ).all(movieId);

    return NextResponse.json({ subtitles });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch subtitles' }, { status: 500 });
  }
}
