'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function updateMovieAction(
  movieId: number,
  formData: any
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const fields = [
      'title', 'year', 'quality', 'plot', 'rating', 
      'genres', 'director', 'language', 'runtime', 
      'thumbnail', 'audience', 'needs_repair'
    ];
    
    const updates: string[] = [];
    const values: any[] = [];

    fields.forEach(field => {
      if (formData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(formData[field]);
      }
    });

    if (updates.length === 0) {
      return {
        status: 'error',
        message: 'No data to override',
      };
    }

    values.push(movieId);
    db.prepare(
      `UPDATE movies SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values);

    revalidatePath(`/admin/movies/${movieId}`);
    revalidatePath('/admin/movies');
    revalidatePath('/');
    revalidatePath(`/watch/${movieId}`);

    return {
      status: 'success',
      message: 'Registry entry synchronized',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return {
        status: 'error',
        message: error.message,
      };
    }
    return {
      status: 'error',
      message: 'Override failed: ' + error.message,
    };
  }
}
