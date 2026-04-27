'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
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

    revalidatePath('/admin/series');
    revalidatePath('/series');

    return {
      status: 'success',
      message: `Cleaned ${clearedCount} broken artwork links.`,
    };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}
