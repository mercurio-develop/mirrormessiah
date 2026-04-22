'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import fs from 'fs';
import { revalidatePath } from 'next/cache';

export async function validateThumbnailsAction(): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const movies = db.prepare('SELECT id, thumbnail FROM movies WHERE thumbnail IS NOT NULL AND thumbnail != ""').all() as any[];
    let clearedCount = 0;

    for (const movie of movies) {
      if (movie.thumbnail.startsWith('http')) continue;

      if (!fs.existsSync(movie.thumbnail)) {
        db.prepare('UPDATE movies SET thumbnail = NULL WHERE id = ?').run(movie.id);
        clearedCount++;
      }
    }

    revalidatePath('/admin/movies');
    revalidatePath('/');

    return {
      status: 'success',
      message: `Cleaned ${clearedCount} broken artwork links.`,
    };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}
