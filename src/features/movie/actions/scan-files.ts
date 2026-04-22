'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm'];

export async function scanMovieFilesAction(movieId: number): Promise<ActionState<{ added: number }>> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // 1. Get current movie files to find parent directory
    const existingFiles = db.prepare('SELECT path, library_id FROM files WHERE movie_id = ?').all(movieId) as { path: string, library_id: number }[];
    
    if (existingFiles.length === 0) {
      return { status: 'error', message: 'No existing files to determine scan directory' };
    }

    const libraryId = existingFiles[0].library_id;
    const movieDir = path.dirname(existingFiles[0].path);

    if (!fs.existsSync(movieDir)) {
      return { status: 'error', message: 'Associated directory no longer exists on disk' };
    }

    // 2. Scan directory for video files
    const allFiles = fs.readdirSync(movieDir);
    const videoFiles = allFiles.filter(f => VIDEO_EXTS.includes(path.extname(f).toLowerCase()));

    let addedCount = 0;
    const existingPaths = new Set(existingFiles.map(f => f.path));

    for (const fileName of videoFiles) {
      const fullPath = path.join(movieDir, fileName);
      if (!existingPaths.has(fullPath)) {
        const stats = fs.statSync(fullPath);
        const container = path.extname(fileName).slice(1);

        db.prepare(`
          INSERT INTO files (movie_id, library_id, path, size_bytes, container, added_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(movieId, libraryId, fullPath, stats.size, container);
        
        addedCount++;
      }
    }

    revalidatePath(`/admin/movies/${movieId}`);
    
    return {
      status: 'success',
      message: `Scan complete: ${addedCount} new files detected`,
      payload: { added: addedCount }
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Scan failed: ' + error.message };
  }
}
