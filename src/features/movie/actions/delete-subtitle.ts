'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function deleteMovieSubtitleAction(
  movieId: number,
  subtitleId: number
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    db.prepare('DELETE FROM subtitles WHERE id = ? AND movie_id = ?').run(subtitleId, movieId);

    revalidatePath(`/admin/movies/${movieId}`);

    return {
      status: 'success',
      message: 'Subtitle removed',
    };
  } catch (error: any) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Delete failed: ' + error.message };
  }
}
