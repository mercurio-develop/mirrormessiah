import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/movies/[id]/scan-files
 * Scans the movie directory for video files and links them to the movie
 */
export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();
    
    // Get current main file path
    const mainFile = db.prepare('SELECT path, library_id FROM files WHERE movie_id = ? LIMIT 1').get(movieId) as { path: string; library_id: number } | undefined;
    
    if (!mainFile) {
        return NextResponse.json({ error: 'No baseline file found to scan from' }, { status: 400 });
    }

    const movieDir = path.dirname(mainFile.path);
    if (!fs.existsSync(movieDir)) {
        return NextResponse.json({ error: 'Movie directory does not exist' }, { status: 404 });
    }

    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v'];
    const files = fs.readdirSync(movieDir);
    
    let found = 0;
    let added = 0;

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (videoExtensions.includes(ext)) {
            found++;
            const fullPath = path.join(movieDir, file);
            
            // Check if already exists
            const existing = db.prepare('SELECT id FROM files WHERE path = ?').get(fullPath);
            if (!existing) {
                const stats = fs.statSync(fullPath);
                db.prepare(`
                    INSERT INTO files (library_id, movie_id, path, size_bytes, container)
                    VALUES (?, ?, ?, ?, ?)
                `).run(mainFile.library_id, movieId, fullPath, stats.size, ext.substring(1));
                added++;
            } else {
                // If it exists but might be linked to another movie (rare for same path)
                // or just ensure it's linked to THIS movie
                db.prepare('UPDATE files SET movie_id = ? WHERE path = ?').run(movieId, fullPath);
            }
        }
    }

    return NextResponse.json({ success: true, found, added });
  } catch (error: any) {
    console.error('File scan error:', error);
    return NextResponse.json({ error: 'Scan failed: ' + error.message }, { status: 500 });
  }
});
