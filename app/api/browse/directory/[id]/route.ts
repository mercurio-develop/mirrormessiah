import { NextRequest, NextResponse } from 'next/server';
import { requireAdminKey } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/browse/directory/[id]?type=images|videos
 * Returns a list of files in the same directory as the movie file
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminKey(request);

    const { id } = await params;
    const movieId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'images';
    
    if (isNaN(movieId)) {
      return NextResponse.json({ error: 'Invalid movie ID' }, { status: 400 });
    }
    
    const db = getDb();
    
    const movieFile = db.prepare(`
      SELECT f.path, m.title
      FROM files f
      JOIN movies m ON f.movie_id = m.id
      WHERE f.movie_id = ?
      LIMIT 1
    `).get(movieId) as { path: string; title: string } | undefined;
    
    if (!movieFile) {
      return NextResponse.json({ error: 'Movie directory not found' }, { status: 404 });
    }
    
    const movieDir = path.dirname(movieFile.path);
    
    if (!fs.existsSync(movieDir)) {
      return NextResponse.json({ files: [], message: 'Directory does not exist' });
    }
    
    const files = fs.readdirSync(movieDir, { withFileTypes: true });
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
    
    const targetExtensions = type === 'videos' ? videoExtensions : imageExtensions;
    
    const filteredFiles = files
      .filter(file => {
        if (!file.isFile()) return false;
        const ext = path.extname(file.name).toLowerCase();
        return targetExtensions.includes(ext);
      })
      .map(file => {
        const filePath = path.join(movieDir, file.name);
        const stats = fs.statSync(filePath);
        
        return {
          name: file.name,
          path: filePath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: path.extname(file.name).toLowerCase(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return NextResponse.json({
      files: filteredFiles,
      directory: movieDir,
      movieTitle: movieFile.title,
    });
    
  } catch (error) {
    console.error('Error browsing directory:', error);
    return NextResponse.json({ error: 'Failed to browse directory' }, { status: 500 });
  }
}
