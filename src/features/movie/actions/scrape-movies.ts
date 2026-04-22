'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { scrapeMovieAction } from './scrape-movie';

export async function scrapeMoviesAction(movieIds: number[]): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    let successCount = 0;
    let failCount = 0;

    for (const movieId of movieIds) {
      try {
        const result = await scrapeMovieAction(movieId);
        if (result.status === 'success') {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }
    }

    return {
      status: 'success',
      message: `Batch scrape complete: ${successCount} successful, ${failCount} failed.`,
    };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}
