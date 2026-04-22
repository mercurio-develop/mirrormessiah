import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';

/**
 * GET /api/movies/[id]/files
 * List all video files associated with a movie
 */
export const GET = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();
    
    const files = db.prepare(`
      SELECT * FROM files 
      WHERE movie_id = ? 
      ORDER BY added_at DESC
    `).all(movieId);

    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
});
