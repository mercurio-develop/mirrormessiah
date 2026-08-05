'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { discoverLocalArtwork, resolveCourseDir } from '@/features/course/lib/local-artwork';
import { revalidatePath } from 'next/cache';

const execFileAsync = promisify(execFile);

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

export async function scrapeCourseMetadataAction(
  courseId: number,
  options: { force?: boolean } = {},
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId) as { id: number } | undefined;
    if (!course) return { status: 'error', message: 'Course not found' };

    const script = path.join(process.cwd(), 'scripts', 'courses_cli.py');
    const args = [script, 'scrape', '--course-id', String(courseId)];
    if (options.force) args.push('--force');

    const { stdout, stderr } = await execFileAsync('python3', args, {
      cwd: process.cwd(),
      timeout: 120_000,
      env: { ...process.env },
    });

    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath('/admin/courses');
    revalidatePath('/courses');
    revalidatePath(`/courses/${courseId}`);

    const output = `${stdout}\n${stderr}`;
    if (output.includes('GEMINI_API_KEY is not set')) {
      return { status: 'error', message: 'GEMINI_API_KEY is not configured' };
    }
    const summary = stdout.split('\n').find((l) => l.includes('SCRAPE_COMPLETE')) || 'Metadata scrape finished';
    return { status: 'success', message: summary.trim() };
  } catch (error: unknown) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: error instanceof Error ? error.message : 'Metadata scrape failed' };
  }
}
