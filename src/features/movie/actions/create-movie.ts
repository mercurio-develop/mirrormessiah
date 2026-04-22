'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import { setMovieCategories } from '@/lib/db_migrate';

export async function createMovieAction(formData: any): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // 1. Get default library
    const library = db.prepare('SELECT id FROM libraries LIMIT 1').get() as { id: number };
    if (!library) {
      return { status: 'error', message: 'No media library found in registry' };
    }

    // 2. Insert movie
    const result = db.prepare(`
      INSERT INTO movies (
        title, year, quality, imdb_id, tmdb_id, thumbnail, plot, 
        director, language, runtime, audience, library_id, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      formData.title,
      formData.year ? parseInt(formData.year) : null,
      formData.quality,
      formData.imdb_id || null,
      formData.tmdb_id ? parseInt(formData.tmdb_id) : null,
      formData.thumbnail || null,
      formData.plot || null,
      formData.director || null,
      formData.language || 'English',
      formData.runtime ? parseInt(formData.runtime) : null,
      formData.audience || null,
      library.id
    );

    const movieId = result.lastInsertRowid as number;

    // 3. Set categories
    if (formData.categories && Array.isArray(formData.categories)) {
      setMovieCategories(movieId, formData.categories);
    }

    revalidatePath('/admin/movies');
    revalidatePath('/');

    return {
      status: 'success',
      message: 'Movie successfully registered',
      payload: { id: movieId }
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Registration failed: ' + error.message };
  }
}
