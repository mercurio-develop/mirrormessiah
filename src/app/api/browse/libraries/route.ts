import { NextResponse } from 'next/server';
import { requireAdminKey } from '@/lib/auth';
import { getDb } from '@/lib/db';

/**
 * GET /api/browse/libraries
 * Returns all registered library roots
 */
export async function GET(request: Request) {
  try {
    await requireAdminKey(request);
    const db = getDb();
    const libraries = db.prepare('SELECT * FROM libraries').all();
    return NextResponse.json({ libraries });
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
