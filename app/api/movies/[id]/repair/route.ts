import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/movies/[id]/repair
 * Flag a movie as needing repair due to playback failure
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();

    db.prepare("UPDATE movies SET needs_repair = 1, updated_at = datetime('now') WHERE id = ?").run(movieId);

    console.log(`[RepairRegistry] MOVIE_ID_${movieId}: Flagged for maintenance due to playback failure.`);

    return NextResponse.json({ success: true, message: 'Movie flagged for repair' });
  } catch (error: any) {
    console.error(`[RepairRegistry] ERROR: ${error.message}`);
    return NextResponse.json({ error: 'Failed to flag movie' }, { status: 500 });
  }
}

/**
 * DELETE /api/movies/[id]/repair
 * Clear repair flag (Admin only, though anyone could call this without withAdminAuth)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();

    db.prepare("UPDATE movies SET needs_repair = 0, updated_at = datetime('now') WHERE id = ?").run(movieId);

    return NextResponse.json({ success: true, message: 'Repair flag cleared' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to clear flag' }, { status: 500 });
  }
}
