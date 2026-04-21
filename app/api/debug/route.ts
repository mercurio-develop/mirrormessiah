import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdminKey, AuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdminKey(request);
    const db = getDb();
    const movieCount = db.prepare('SELECT COUNT(*) as count FROM movies').get() as any;
    
    return NextResponse.json({
      dbPath: (db as any).name,
      movieCount: movieCount.count,
      envStatus: {
        ADMIN_KEY_DEFINED: !!process.env.ADMIN_KEY,
        ADMIN_KEY_VALUE_HIDDEN: process.env.ADMIN_KEY ? process.env.ADMIN_KEY.substring(0, 2) + '...' : 'NONE',
        NODE_ENV: process.env.NODE_ENV
      }
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
