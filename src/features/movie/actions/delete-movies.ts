'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function deleteMoviesAction(
  movieIds: number[],
  options: { deleteFiles?: boolean; deleteDirectory?: boolean } = {}
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();
    let purgedCount = 0;

    for (const movieId of movieIds) {
        // 1. Identify shared resources to prevent data loss
        const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
        const subs  = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];
        
        if (options.deleteFiles || options.deleteDirectory) {
          // Find all paths in the DB linked to OTHER movies (excluding the current batch)
          const placeholders = movieIds.map(() => '?').join(',');
          const allOtherPaths = new Set<string>(
            (db.prepare(`
                SELECT path FROM files WHERE movie_id NOT IN (${placeholders}) 
                UNION 
                SELECT path FROM subtitles WHERE movie_id NOT IN (${placeholders})
            `).all(...movieIds, ...movieIds) as { path: string }[])
              .map(r => r.path)
          );

          // Handle Individual Files
          if (options.deleteFiles && !options.deleteDirectory) {
            for (const f of [...files, ...subs]) {
              if (allOtherPaths.has(f.path)) continue;
              try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch {}
            }
          }

          // Handle Full Directory
          if (options.deleteDirectory && files.length > 0) {
            const movieDir = path.dirname(files[0].path);
            
            // Check if ANY file in this directory belongs to another movie in the DB (not in this batch)
            const sharedDirEntries = db.prepare(`SELECT COUNT(*) as count FROM files WHERE movie_id NOT IN (${placeholders}) AND path LIKE ?`).get(...movieIds, movieDir + '%') as { count: number };
            
            if (sharedDirEntries.count === 0) {
               try {
                 if (fs.existsSync(movieDir)) {
                   fs.rmSync(movieDir, { recursive: true, force: true });
                 }
               } catch (e) {
                 console.error(`Failed to delete directory: ${movieDir}`, e);
               }
            }
          }
        }

        db.prepare("DELETE FROM movie_categories WHERE movie_id = ?").run(movieId);
        db.prepare("DELETE FROM subtitles WHERE movie_id = ?").run(movieId);
        db.prepare("DELETE FROM files WHERE movie_id = ?").run(movieId);
        db.prepare("DELETE FROM movies WHERE id = ?").run(movieId);
        purgedCount++;
    }

    revalidatePath('/admin/movies');
    revalidatePath('/');

    return {
      status: 'success',
      message: `Batch purge of ${purgedCount} entities complete`,
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Batch purge failed: ' + error.message };
  }
}
