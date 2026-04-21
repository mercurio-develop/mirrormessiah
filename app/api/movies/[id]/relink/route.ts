import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import path from 'path';
import fs from 'fs';

/**
 * POST /api/movies/[id]/relink
 * Adds or updates a file or directory link for a movie
 */
export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const { filePath, directoryPath } = await request.json();

    if (!filePath && !directoryPath) {
      return NextResponse.json({ error: 'File or Directory path required' }, { status: 400 });
    }

    const targetPath = filePath || directoryPath;

    // Security check
    const isValid = await validateFilePath(targetPath);
    if (!isValid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ error: 'Path does not exist on disk' }, { status: 404 });
    }

    const db = getDb();
    
    // Find matching library
    const library = db.prepare("SELECT id FROM libraries WHERE ? LIKE root_path || '%' LIMIT 1").get(targetPath) as { id: number } | undefined;
    
    if (!library) {
        return NextResponse.json({ error: 'Path is not within any registered library' }, { status: 400 });
    }

    if (filePath) {
        // Relink single file
        const ext = path.extname(filePath).toLowerCase();
        db.prepare(`
          INSERT INTO files (library_id, movie_id, path, container, size_bytes)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(path) DO UPDATE SET
            movie_id = excluded.movie_id
        `).run(library.id, movieId, filePath, ext.substring(1), fs.statSync(filePath).size);
    } else {
        // Relink directory: scan and add all videos in it
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v'];
        const files = fs.readdirSync(directoryPath);
        
        let added = 0;
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (videoExtensions.includes(ext)) {
                const fullPath = path.join(directoryPath, file);
                const stats = fs.statSync(fullPath);
                
                db.prepare(`
                    INSERT INTO files (library_id, movie_id, path, size_bytes, container)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(path) DO UPDATE SET
                        movie_id = excluded.movie_id
                `).run(library.id, movieId, fullPath, stats.size, ext.substring(1));
                added++;
            }
        }
        
        if (added === 0) {
            return NextResponse.json({ error: 'No video files found in the specified directory' }, { status: 400 });
        }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Relink error:', error);
    return NextResponse.json({ error: 'Relink failed: ' + error.message }, { status: 500 });
  }
});
