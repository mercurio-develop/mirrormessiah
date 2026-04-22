import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
