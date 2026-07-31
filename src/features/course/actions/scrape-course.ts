'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { discoverLocalArtwork, resolveCourseDir } from '@/features/course/lib/local-artwork';
import { revalidatePath } from 'next/cache';

const execFileAsync = promisify(execFile);

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

export async function scrapeCourseThumbnailsAction(
  courseId: number,
  options: { force?: boolean } = {},
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    const course = db.prepare('SELECT id, thumbnail FROM courses WHERE id = ?').get(courseId) as { id: number; thumbnail: string | null } | undefined;
    if (!course) return { status: 'error', message: 'Course not found' };

    const dir = resolveCourseDir(db, courseId);
    if (dir) discoverLocalArtwork(db, courseId, dir, course.thumbnail);

    const script = path.join(process.cwd(), 'scripts', 'courses_cli.py');
    const args = [script, 'thumbs', '--course-id', String(courseId)];
    if (options.force) args.push('--force');

    const { stdout } = await execFileAsync('python3', args, {
      cwd: process.cwd(),
      timeout: 600_000,
      env: { ...process.env },
    });

    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath('/admin/courses');
    revalidatePath('/courses');
    revalidatePath(`/courses/${courseId}`);

    const summary = stdout.split('\n').find((l) => l.includes('THUMBS_COMPLETE')) || 'Thumbnails updated';
    return { status: 'success', message: summary.trim() };
  } catch (error: unknown) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: error instanceof Error ? error.message : 'Thumbnail scrape failed' };
  }
}
