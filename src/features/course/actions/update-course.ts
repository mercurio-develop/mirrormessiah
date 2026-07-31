'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

interface UpdateCourseData {
  title?: string;
  plot?: string;
  rating?: number | null;
  platform?: string;
  category?: string;
  instructor?: string;
  language?: string;
  thumbnail?: string;
  year?: number | null;
  needs_repair?: number;
}

export async function updateCourseAction(courseId: number, data: UpdateCourseData): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    const current = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);
    if (!current) return { status: 'error', message: 'Course not found' };

    const allowed = ['title', 'plot', 'rating', 'platform', 'category', 'instructor', 'language', 'thumbnail', 'year', 'needs_repair'] as const;
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(courseId);
      db.prepare(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath('/admin/courses');
    revalidatePath(`/courses/${courseId}`);
    revalidatePath('/courses');
    return { status: 'success', message: 'Course updated successfully' };
  } catch (error: unknown) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: error instanceof Error ? error.message : 'Update failed' };
  }
}
