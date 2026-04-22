'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

const SUB_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];

function detectLangFromPath(filePath: string): string {
  const name = path.basename(filePath).toLowerCase();
  const lang3_map: Record<string, string> = {
    'eng': 'en', 'spa': 'es', 'fre': 'fr', 'ger': 'de',
    'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh',
  };
  const parts = name.split('.');
  if (parts.length >= 2 && lang3_map[parts[parts.length - 2]]) {
    return lang3_map[parts[parts.length - 2]];
  }
  const full = filePath.toLowerCase();
  for (const [code, short] of Object.entries(lang3_map)) {
    if (full.includes(code)) return short;
  }
  return 'en';
}

export async function scanMovieSubtitlesAction(movieId: number): Promise<ActionState<{ found: number, added: number }>> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    // 1. Get current movie files to find parent directory
    const existingFiles = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
    if (existingFiles.length === 0) {
      return { status: 'error', message: 'No media files linked to determine scan directory' };
    }

    const movieDir = path.dirname(existingFiles[0].path);
    if (!fs.existsSync(movieDir)) {
      return { status: 'error', message: 'Directory does not exist on disk' };
    }

    // 2. Scan recursively
    const allFiles: string[] = [];
    const walk = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          walk(fullPath);
        } else if (SUB_EXTS.includes(path.extname(file).toLowerCase())) {
          allFiles.push(fullPath);
        }
      }
    };
    walk(movieDir);

    const existingSubs = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];
    const existingPaths = new Set(existingSubs.map(s => s.path));

    let addedCount = 0;
    for (const subPath of allFiles) {
      if (!existingPaths.has(subPath)) {
        const lang = detectLangFromPath(subPath);
        const format = path.extname(subPath).slice(1);

        db.prepare(`
          INSERT INTO subtitles (movie_id, path, lang, format)
          VALUES (?, ?, ?, ?)
        `).run(movieId, subPath, lang, format);
        addedCount++;
      }
    }

    revalidatePath(`/admin/movies/${movieId}`);
    
    return {
      status: 'success',
      message: `Found ${allFiles.length} file(s), added ${addedCount} new`,
      payload: { found: allFiles.length, added: addedCount }
    };
  } catch (error: any) {
    if (error instanceof AuthError) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Scan failed: ' + error.message };
  }
}
