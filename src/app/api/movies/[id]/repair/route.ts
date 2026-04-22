import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireGateKey, requireAdminKey, AuthError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireGateKey(request);
    const { id } = await params;
    const movieId = parseInt(id);
    if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const db = getDb();
    db.prepare("UPDATE movies SET needs_repair = 1, updated_at = datetime('now') WHERE id = ?").run(movieId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Failed to flag movie' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminKey(request);
    const { id } = await params;
    const movieId = parseInt(id);
    if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const db = getDb();
    db.prepare("UPDATE movies SET needs_repair = 0, updated_at = datetime('now') WHERE id = ?").run(movieId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Failed to clear flag' }, { status: 500 });
  }
}
