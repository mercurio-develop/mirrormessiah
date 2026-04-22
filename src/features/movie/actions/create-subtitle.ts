'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import path from 'path';

export async function createMovieSubtitleAction(
  movieId: number,
  formData: { path: string; lang?: string; label?: string }
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const format = path.extname(formData.path).slice(1) || 'srt';

    db.prepare(`
      INSERT INTO subtitles (movie_id, path, lang, label, format)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      movieId,
      formData.path,
      formData.lang || null,
      formData.label || null,
      format
    );

    revalidatePath(`/admin/movies/${movieId}`);

    return {
      status: 'success',
      message: 'Subtitle registered',
    };
  } catch (error: any) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Add failed: ' + error.message };
  }
}
