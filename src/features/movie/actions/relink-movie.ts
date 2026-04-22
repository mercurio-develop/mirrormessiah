'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm'];

export async function relinkMovieAction(
  movieId: number,
  options: { filePath?: string; directoryPath?: string }
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // 1. Resolve library
    const library = db.prepare('SELECT id FROM libraries LIMIT 1').get() as { id: number };
    if (!library) return { status: 'error', message: 'No library found' };

    // 2. Handle Directory Link (Scan whole dir)
    if (options.directoryPath) {
      const dir = options.directoryPath;
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return { status: 'error', message: 'Invalid directory path' };
      }

      const allFiles = fs.readdirSync(dir);
      const videoFiles = allFiles.filter(f => VIDEO_EXTS.includes(path.extname(f).toLowerCase()));

      for (const fileName of videoFiles) {
        const fullPath = path.join(dir, fileName);
        const stats = fs.statSync(fullPath);
        const container = path.extname(fileName).slice(1);

        db.prepare(`
          INSERT OR IGNORE INTO files (movie_id, library_id, path, size_bytes, container, added_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(movieId, library.id, fullPath, stats.size, container);
      }
    } 
    // 3. Handle Single File Link
    else if (options.filePath) {
      const file = options.filePath;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return { status: 'error', message: 'Invalid file path' };
      }

      const stats = fs.statSync(file);
      const container = path.extname(file).slice(1);

      db.prepare(`
        INSERT OR IGNORE INTO files (movie_id, library_id, path, size_bytes, container, added_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(movieId, library.id, file, stats.size, container);
    }

    revalidatePath(`/admin/movies/${movieId}`);
    
    return {
      status: 'success',
      message: 'Registry synchronized with new storage source',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Relink failed: ' + error.message };
  }
}
