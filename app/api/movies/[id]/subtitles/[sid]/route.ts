import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';

export const DELETE = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) => {
  const { id, sid } = await params;
  const movieId = parseInt(id);
  const subtitleId = parseInt(sid);

  if (isNaN(movieId) || isNaN(subtitleId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'DELETE FROM subtitles WHERE id = ? AND movie_id = ?'
  ).run(subtitleId, movieId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
