import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/movies/[id]/poster
 * Selects an image from the movie directory and renames/copies it to poster.{ext}
 */
export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    }

    const db = getDb();
    
    // Validate that this file exists and is an image
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const isValid = await validateFilePath(filePath);
    if (!isValid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const movieDir = path.dirname(filePath);
    const targetName = `poster${ext}`;
    const targetPath = path.join(movieDir, targetName);

    // If source is already the target, just update the DB
    if (path.resolve(filePath) !== path.resolve(targetPath)) {
        // Handle renaming/copying
        if (fs.existsSync(targetPath)) {
            // Backup or just delete old poster? Let's delete for cleanliness as requested
            fs.unlinkSync(targetPath);
        }
        fs.copyFileSync(filePath, targetPath);
    }

    // Update DB
    db.prepare("UPDATE movies SET thumbnail = ? WHERE id = ?").run(targetPath, movieId);

    return NextResponse.json({ 
        success: true, 
        thumbnail: targetPath 
    });

  } catch (error: any) {
    console.error('Poster selection error:', error);
    return NextResponse.json({ error: 'Failed to update poster' }, { status: 500 });
  }
});
