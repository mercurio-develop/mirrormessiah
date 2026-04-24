import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireGateKey } from '@/lib/auth';

/**
 * POST /api/movies/[id]/repair
 * Flags a movie as needing repair.
 */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireGateKey(request);

        const { id } = await context.params;
        const movieId = parseInt(id);
        const db = getDb();

        const result = db.prepare('UPDATE movies SET needs_repair = 1 WHERE id = ?').run(movieId);

        if (result.changes === 0) {
            return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: `Movie ${movieId} flagged for repair.` });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Authentication required')) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Error in POST /api/movies/[id]/repair:', error);
        return NextResponse.json({ error: 'Failed to flag for repair' }, { status: 500 });
    }
}

/**
 * DELETE /api/movies/[id]/repair
 * Clears the repair flag for a movie.
 */
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireGateKey(request);

        const { id } = await context.params;
        const movieId = parseInt(id);
        const db = getDb();

        const result = db.prepare('UPDATE movies SET needs_repair = 0 WHERE id = ?').run(movieId);

        if (result.changes === 0) {
            return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: `Repair flag cleared for movie ${movieId}.` });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Authentication required')) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        console.error('Error in DELETE /api/movies/[id]/repair:', error);
        return NextResponse.json({ error: 'Failed to clear repair flag' }, { status: 500 });
    }
}
