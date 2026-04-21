import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';

/**
 * DELETE /api/movies/[id]/files/[fid]
 * Removes a file association from a movie
 */
export const DELETE = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string; fid: string }> }
) => {
  try {
    const { fid } = await params;
    const fileId = parseInt(fid);
    const db = getDb();
    
    db.prepare("DELETE FROM files WHERE id = ?").run(fileId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete file association' }, { status: 500 });
  }
});
