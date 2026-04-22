'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm'];

export async function scanMovieFilesAction(movieId: number): Promise<ActionState<{ added: number; removed: number; repaired: boolean }>> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // 1. Get movie details and current files
    const movie = db.prepare('SELECT title, year, library_id FROM movies WHERE id = ?').get(movieId) as { title: string, year: number, library_id: number };
    const existingFiles = db.prepare('SELECT id, path, library_id FROM files WHERE movie_id = ?').all(movieId) as { id: number, path: string, library_id: number }[];
    
    if (!movie) return { status: 'error', message: 'Movie not found' };

    let movieDir: string | null = null;
    let repaired = false;
    let removedCount = 0;

    // 2. Check for dead links and determine scan directory
    if (existingFiles.length > 0) {
        movieDir = path.dirname(existingFiles[0].path);
        
        // If the known directory is gone, try to find it in the same library root
        if (!fs.existsSync(movieDir)) {
            const library = db.prepare('SELECT root_path FROM libraries WHERE id = ?').get(movie.library_id) as { root_path: string };
            if (library && fs.existsSync(library.root_path)) {
                // Look for a folder matching "Title (Year)"
                const expectedName = `${movie.title} (${movie.year})`;
                const items = fs.readdirSync(library.root_path);
                const match = items.find(item => item.startsWith(expectedName));
                
                if (match) {
                    const newDir = path.join(library.root_path, match);
                    console.log(`[AutoRepair] Relinking ${movie.title} from ${movieDir} to ${newDir}`);
                    
                    // Update all existing file paths to the new directory
                    for (const f of existingFiles) {
                        const newPath = path.join(newDir, path.basename(f.path));
                        if (fs.existsSync(newPath)) {
                            db.prepare('UPDATE files SET path = ? WHERE id = ?').run(newPath, f.id);
                        } else {
                            db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
                            removedCount++;
                        }
                    }
                    movieDir = newDir;
                    repaired = true;
                }
            }
        }
    }

    if (!movieDir || !fs.existsSync(movieDir)) {
        // Final cleanup of any remaining dead links if we still haven't found a dir
        for (const f of existingFiles) {
            if (!fs.existsSync(f.path)) {
                db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
                removedCount++;
            }
        }
        return { 
            status: repaired ? 'success' : 'error', 
            message: repaired ? 'Directory location repaired' : 'Sector location could not be determined. Please use manual relink.',
            payload: { added: 0, removed: removedCount, repaired }
        };
    }

    // 3. Scan directory for video files
    const allFiles = fs.readdirSync(movieDir);
    const videoFiles = allFiles.filter(f => VIDEO_EXTS.includes(path.extname(f).toLowerCase()));

    // Refresh existing files after possible repair
    const updatedFiles = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
    const existingPaths = new Set(updatedFiles.map(f => f.path));

    let addedCount = 0;
    for (const fileName of videoFiles) {
      const fullPath = path.join(movieDir, fileName);
      if (!existingPaths.has(fullPath)) {
        const stats = fs.statSync(fullPath);
        const container = path.extname(fileName).slice(1);

        db.prepare(`
          INSERT INTO files (movie_id, library_id, path, size_bytes, container, added_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(movieId, movie.library_id, fullPath, stats.size, container);
        
        addedCount++;
      }
    }

    revalidatePath(`/admin/movies/${movieId}`);
    
    return {
      status: 'success',
      message: repaired ? `Repaired and added ${addedCount} files` : `Scan complete: ${addedCount} new files detected`,
      payload: { added: addedCount, removed: removedCount, repaired }
    };
  } catch (error: any) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Scan failed: ' + error.message };
  }
}
