'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function updateSeriesAudienceAction(
  seriesIds: number[],
  audience: 'family' | 'adult' | null
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    
    const db = getDb();
    
    db.transaction(() => {
        const updateSeries = db.prepare("UPDATE series SET audience = ?, updated_at = datetime('now') WHERE id = ?");
        for (const id of seriesIds) {
            updateSeries.run(audience, id);
        }
    })();

    revalidatePath('/admin/series');
    revalidatePath('/series');
    
    return {
      status: 'success',
      message: `Updated audience for ${seriesIds.length} series.`,
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Update failed: ' + error.message };
  }
}
