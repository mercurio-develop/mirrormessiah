'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { resyncMovieSubtitles } from '@/lib/movie-subtitles';
import { revalidatePath } from 'next/cache';

export async function scanMovieSubtitlesAction(movieId: number): Promise<ActionState<{ found: number, added: number }>> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
    if (!movie) {
      return { status: 'error', message: 'Movie not found' };
    }

    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE movie_id = ?').get(movieId) as { count: number };
    if (fileCount.count === 0) {
      return { status: 'error', message: 'No media files linked to determine scan directory' };
    }

    const { found, added, removed } = resyncMovieSubtitles(db, movieId);

    revalidatePath(`/admin/movies/${movieId}`);

    return {
      status: 'success',
      message: `Found ${found} file(s), added ${added} new, removed ${removed} broken`,
      payload: { found, added },
    };
  } catch (error: any) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Scan failed: ' + error.message };
  }
}
