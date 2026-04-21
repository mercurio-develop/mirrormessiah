import { NextRequest, NextResponse } from 'next/server';
import { requireAdminKey } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { validateFilePath } from '@/lib/pathenc';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/browse/movie-posters/[id]
 * Returns a list of poster files in the same directory as the movie file
 * Requires x-admin-key header for security
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Validate admin key
    await requireAdminKey(request);

    const { id } = await params;
    const movieId = parseInt(id);
    
    if (isNaN(movieId)) {
      return NextResponse.json(
        { error: 'Invalid movie ID' },
        { status: 400 }
      );
    }
    
    const db = getDb();
    
    // Get the movie's file path
    const movieFile = db.prepare(`
      SELECT f.path, m.title
      FROM files f
      JOIN movies m ON f.movie_id = m.id
      WHERE f.movie_id = ?
      ORDER BY 
        (CASE WHEN lower(f.path) LIKE '%.mp4' THEN 0 ELSE 1 END),
        f.size_bytes DESC
      LIMIT 1
    `).get(movieId) as { path: string; title: string } | undefined;
    
    if (!movieFile) {
      return NextResponse.json(
        { error: 'Movie file not found' },
        { status: 404 }
      );
    }
    
    // Validate file path for security
    const isValidPath = await validateFilePath(movieFile.path);
    if (!isValidPath) {
      return NextResponse.json(
        { error: 'Access denied to movie file path' },
        { status: 403 }
      );
    }
    
    // Get the directory containing the movie file
    const movieDir = path.dirname(movieFile.path);
    
    // Check if directory exists
    if (!fs.existsSync(movieDir)) {
      return NextResponse.json({
        files: [],
        message: 'Movie directory does not exist',
        movieTitle: movieFile.title,
        directory: movieDir
      });
    }
    
    // Read directory contents
    const files = fs.readdirSync(movieDir, { withFileTypes: true });
    
    // Filter for image files only
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'];
    const imageFiles = files
      .filter(file => {
        if (!file.isFile()) return false;
        const ext = path.extname(file.name).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .map(file => {
        const filePath = path.join(movieDir, file.name);
        const stats = fs.statSync(filePath);
        
        // Use absolute path to avoid "../../../.." patterns that cause Next.js NormalizeError
        // The /api/images route can handle absolute paths directly
        const absolutePath = filePath;
        
        return {
          name: file.name,
          path: absolutePath, // Full absolute path for /api/images route
          absolutePath: filePath, // Full absolute path
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: path.extname(file.name).toLowerCase(),
          // Indicate this is a movie directory poster
          type: 'movie-directory'
        };
      })
      .sort((a, b) => {
        // Sort poster-like files first, then alphabetically
        const aPosterLike = /poster|cover|thumb|art/i.test(a.name);
        const bPosterLike = /poster|cover|thumb|art/i.test(b.name);
        
        if (aPosterLike && !bPosterLike) return -1;
        if (!aPosterLike && bPosterLike) return 1;
        
        return a.name.localeCompare(b.name);
      });
    
    return NextResponse.json({
      files: imageFiles,
      total: imageFiles.length,
      movieTitle: movieFile.title,
      directory: movieDir,
      type: 'movie-directory'
    });
    
  } catch (error) {
    console.error('Error browsing movie posters:', error);
    
    if (error instanceof Error && error.message.includes('Invalid admin key')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to browse movie poster directory' },
      { status: 500 }
    );
  }
}