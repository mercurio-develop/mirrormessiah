'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function deleteSeriesAction(
  seriesIds: number[],
  options: { deleteFiles?: boolean; deleteDirectory?: boolean } = {}
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    let purgedCount = 0;

    for (const seriesId of seriesIds) {
        const files = db.prepare(`
          SELECT f.path 
          FROM episode_files f
          JOIN episodes e ON f.episode_id = e.id
          JOIN seasons s ON e.season_id = s.id
          WHERE s.series_id = ?
        `).all(seriesId) as { path: string }[];
        
        const subs = db.prepare(`
          SELECT es.path 
          FROM episode_subtitles es
          JOIN episodes e ON es.episode_id = e.id
          JOIN seasons s ON e.season_id = s.id
          WHERE s.series_id = ?
        `).all(seriesId) as { path: string }[];
        
        if (options.deleteFiles || options.deleteDirectory) {
          const placeholders = seriesIds.map(() => '?').join(',');
          
          if (options.deleteFiles && !options.deleteDirectory) {
            for (const f of [...files, ...subs]) {
              try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch {}
            }
          }

          if (options.deleteDirectory && files.length > 0) {
            // Just assume all files are in the same series dir
            const firstFile = files[0].path;
            const seriesDir = path.dirname(path.dirname(firstFile)); // Go up from season to series folder
            
            try {
              if (fs.existsSync(seriesDir)) {
                fs.rmSync(seriesDir, { recursive: true, force: true });
              }
            } catch (e) {
              console.error(`Failed to delete directory: ${seriesDir}`, e);
            }
          }
        }

        // Delete from DB (ON DELETE CASCADE should handle this if foreign keys are ON, but we do it manually to be safe)
        db.prepare(`DELETE FROM episode_subtitles WHERE episode_id IN (SELECT id FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE series_id = ?))`).run(seriesId);
        db.prepare(`DELETE FROM episode_files WHERE episode_id IN (SELECT id FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE series_id = ?))`).run(seriesId);
        db.prepare(`DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE series_id = ?)`).run(seriesId);
        db.prepare(`DELETE FROM seasons WHERE series_id = ?`).run(seriesId);
        db.prepare(`DELETE FROM series WHERE id = ?`).run(seriesId);
        purgedCount++;
    }

    revalidatePath('/admin/series');
    revalidatePath('/series');

    return {
      status: 'success',
      message: `Batch purge of ${purgedCount} series complete`,
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Batch purge failed: ' + error.message };
  }
}
