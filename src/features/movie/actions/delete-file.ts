'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function deleteMovieFileAction(
  movieId: number,
  fileId: number
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // Prevent deleting the last file
    const countRow = db.prepare('SELECT COUNT(*) as count FROM files WHERE movie_id = ?').get(movieId) as { count: number };
    if (countRow.count <= 1) {
      return { status: 'error', message: 'Cannot remove last remaining media source' };
    }

    db.prepare('DELETE FROM files WHERE id = ? AND movie_id = ?').run(fileId, movieId);

    revalidatePath(`/admin/movies/${movieId}`);

    return {
      status: 'success',
      message: 'Media source detached from registry',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Detachment failed: ' + error.message };
  }
}
