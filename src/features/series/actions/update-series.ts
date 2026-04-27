'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

interface UpdateSeriesData {
  title?: string;
  plot?: string;
  rating?: number | null;
  genres?: string;
  director?: string;
  language?: string;
  audience?: string | null;
  thumbnail?: string;
  year?: number | null;
  needs_repair?: number;
}

export async function updateSeriesAction(
  seriesId: number,
  data: UpdateSeriesData
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const current = db.prepare('SELECT * FROM series WHERE id = ?').get(seriesId) as any;
    if (!current) {
      return { status: 'error', message: 'Series not found' };
    }

    const updates: string[] = [];
    const values: any[] = [];

    const allowedFields = [
      'title', 'plot', 'rating', 'genres', 'director', 
      'language', 'audience', 'thumbnail', 'year', 'needs_repair'
    ];

    for (const field of allowedFields) {
      if (data[field as keyof UpdateSeriesData] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field as keyof UpdateSeriesData]);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(seriesId);

      const query = `UPDATE series SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(query).run(...values);
    }

    revalidatePath(`/admin/series/${seriesId}`);
    revalidatePath('/admin/series');
    revalidatePath(`/series/${seriesId}`);
    revalidatePath('/');

    return {
      status: 'success',
      message: 'Series updated successfully',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Update failed: ' + error.message };
  }
}
