'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { discoverLocalArtwork, resolveSeriesDir } from '@/features/series/lib/local-artwork';
import fs from 'fs';
import { revalidatePath } from 'next/cache';

export async function validateSeriesThumbnailsAction(): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const series = db.prepare('SELECT id, thumbnail FROM series WHERE thumbnail IS NOT NULL AND thumbnail != ""').all() as any[];
    let clearedCount = 0;

    for (const s of series) {
      if (s.thumbnail.startsWith('http')) continue;

      if (!fs.existsSync(s.thumbnail)) {
        db.prepare('UPDATE series SET thumbnail = NULL WHERE id = ?').run(s.id);
        clearedCount++;
      }
    }

    let backfilledCount = 0;
    const allSeries = db.prepare('SELECT id, thumbnail FROM series').all() as { id: number; thumbnail: string | null }[];
    for (const s of allSeries) {
      const seriesDir = resolveSeriesDir(db, s.id);
      if (!seriesDir) continue;

      const before = s.thumbnail;
      discoverLocalArtwork(db, s.id, seriesDir, before);
      const after = db.prepare('SELECT thumbnail FROM series WHERE id = ?').get(s.id) as { thumbnail: string | null };
      if (!before && after.thumbnail) {
        backfilledCount++;
      }
    }

    revalidatePath('/admin/series');
    revalidatePath('/series');

    return {
      status: 'success',
      message: `Cleaned ${clearedCount} broken artwork links. Backfilled ${backfilledCount} from local files.`,
    };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}
