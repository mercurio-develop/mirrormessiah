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
    const targetId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'images';
    const mediaType = searchParams.get('mediaType') || 'movie';
    
    if (isNaN(targetId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    
    const db = getDb();
    
    let targetDir: string | null = null;
    let libraryId: number | undefined;
    let title: string = '';

    if (mediaType === 'series') {
      const seriesFile = db.prepare(`
        SELECT f.path, s.library_id, s.title
        FROM series s
        LEFT JOIN seasons se ON se.series_id = s.id
        LEFT JOIN episodes e ON e.season_id = se.id
        LEFT JOIN episode_files f ON f.episode_id = e.id
        WHERE s.id = ? AND f.path IS NOT NULL
        LIMIT 1
      `).get(targetId) as { path: string | null; library_id: number; title: string } | undefined;
      
      if (!seriesFile) {
        const seriesData = db.prepare('SELECT library_id, title FROM series WHERE id = ?').get(targetId) as any;
        if (!seriesData) return NextResponse.json({ error: 'Series record not found' }, { status: 404 });
        libraryId = seriesData.library_id;
        title = seriesData.title;
      } else {
        libraryId = seriesFile.library_id;
        title = seriesFile.title;
        if (seriesFile.path) {
          // Series files are typically structured as: Series Folder / Season Folder / Episode.mp4
          // We want to return the Series Folder
          targetDir = path.dirname(path.dirname(seriesFile.path));
        }
      }
    } else {
      // 1. Try to find an existing file link for movies
      const movieFile = db.prepare(`
        SELECT f.path, m.library_id, m.title
        FROM movies m
        LEFT JOIN files f ON f.movie_id = m.id
        WHERE m.id = ?
        LIMIT 1
      `).get(targetId) as { path: string | null; library_id: number; title: string } | undefined;
      
      if (!movieFile) {
        return NextResponse.json({ error: 'Movie record not found' }, { status: 404 });
      }

      libraryId = movieFile.library_id;
      title = movieFile.title;

      if (movieFile.path) {
          targetDir = path.dirname(movieFile.path);
      }
    }

    if (targetDir && !fs.existsSync(targetDir)) {
        targetDir = null; // Directory vanished
    }

    // 2. If no file path or directory vanished, attempt to construct the expected path, then fallback to library root
    if (!targetDir && libraryId !== undefined) {
        const library = db.prepare('SELECT root_path FROM libraries WHERE id = ?').get(libraryId) as { root_path: string } | undefined;
        if (library) {
            // Predict the folder name based on title (and year if available in DB, though we don't have year in this scope easily without another query)
            // For now, just try to join title. If it exists, use it. If not, fallback to library root.
            const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '_').trim();
            const predictedDir = path.join(library.root_path, cleanTitle);
            
            // Also try with year if we can get it
            let predictedDirWithYear = predictedDir;
            if (mediaType === 'series') {
               const sData = db.prepare('SELECT year FROM series WHERE id = ?').get(targetId) as any;
               if (sData && sData.year) predictedDirWithYear = path.join(library.root_path, `${cleanTitle} (${sData.year})`);
            } else {
               const mData = db.prepare('SELECT year FROM movies WHERE id = ?').get(targetId) as any;
               if (mData && mData.year) predictedDirWithYear = path.join(library.root_path, `${cleanTitle} (${mData.year})`);
            }

            if (fs.existsSync(predictedDirWithYear)) {
                targetDir = predictedDirWithYear;
            } else if (fs.existsSync(predictedDir)) {
                targetDir = predictedDir;
            } else {
                targetDir = library.root_path;
            }
        }
    }
    
    if (!targetDir) {
      return NextResponse.json({ error: 'Sector location could not be determined' }, { status: 404 });
    }
    
    if (!fs.existsSync(targetDir)) {
      return NextResponse.json({ files: [], message: 'Directory does not exist' });
    }
    
    const files = fs.readdirSync(targetDir, { withFileTypes: true });
    
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
        const filePath = path.join(targetDir, file.name);
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
      directory: targetDir,
      movieTitle: title,
    });
    
  } catch (error) {
    console.error('Error browsing directory:', error);
    return NextResponse.json({ error: 'Failed to browse directory' }, { status: 500 });
  }
}
