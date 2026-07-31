'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import { discoverLocalArtwork, resolveCourseDir } from '@/features/course/lib/local-artwork';

export async function validateCourseThumbnailsAction(): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    let cleared = 0;
    let backfilled = 0;

    for (const c of db.prepare('SELECT id, thumbnail FROM courses WHERE thumbnail IS NOT NULL AND thumbnail != ""').all() as { id: number; thumbnail: string }[]) {
      if (c.thumbnail.startsWith('http')) continue;
      if (!fs.existsSync(c.thumbnail)) {
        db.prepare('UPDATE courses SET thumbnail = NULL WHERE id = ?').run(c.id);
        cleared++;
      }
    }

    for (const c of db.prepare('SELECT id, thumbnail FROM courses').all() as { id: number; thumbnail: string | null }[]) {
      const dir = resolveCourseDir(db, c.id);
      if (!dir) continue;
      const before = c.thumbnail;
      discoverLocalArtwork(db, c.id, dir, before);
      const after = db.prepare('SELECT thumbnail FROM courses WHERE id = ?').get(c.id) as { thumbnail: string | null };
      if (!before && after.thumbnail) backfilled++;
    }

    revalidatePath('/admin/courses');
    revalidatePath('/courses');
    return {
      status: 'success',
      message: `Cleaned ${cleared} broken links. Backfilled ${backfilled} from disk.`,
    };
  } catch (error: unknown) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: error instanceof Error ? error.message : 'Validation failed' };
  }
}
