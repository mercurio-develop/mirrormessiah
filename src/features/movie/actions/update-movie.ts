'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function updateMovieAction(
  movieId: number,
  formData: any
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const fields = [
      'title', 'year', 'quality', 'plot', 'rating', 
      'genres', 'director', 'language', 'runtime', 
      'thumbnail', 'audience', 'needs_repair'
    ];
    
    const updates: string[] = [];
    const values: any[] = [];

    fields.forEach(field => {
      if (formData[field] !== undefined) {
        let value = formData[field];
        
        // Normalize audience to NULL if empty to satisfy CHECK constraint
        if (field === 'audience' && value === '') {
            value = null;
        }

        updates.push(`${field} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return {
        status: 'error',
        message: 'No data to override',
      };
    }

    values.push(movieId);
    db.prepare(
      `UPDATE movies SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values);

    // If title, year, or quality changed, trigger a filesystem sync
    const needsRename = ['title', 'year', 'quality'].some(f => formData[f] !== undefined);
    if (needsRename) {
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Run organize command via the unified CLI
            // We use --no-backup for speed as this is a surgical rename
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            execAsync(`${pythonCmd} scripts/mm.py organize --no-backup`)
                .catch((err: Error) => console.error('[updateMovieAction] Post-update organize failed:', err));
        } catch (e) {
            console.error('[updateMovieAction] Failed to trigger rename script:', e);
        }
    }

    revalidatePath(`/admin/movies/${movieId}`);
    revalidatePath('/admin/movies');
    revalidatePath('/');
    revalidatePath(`/watch/${movieId}`);

    return {
      status: 'success',
      message: 'Registry entry synchronized',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return {
        status: 'error',
        message: error.message,
      };
    }
    return {
      status: 'error',
      message: 'Override failed: ' + error.message,
    };
  }
}
