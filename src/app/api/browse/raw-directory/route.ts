import { NextRequest, NextResponse } from 'next/server';
import { requireAdminKey } from '@/lib/auth';
import { validateFilePath } from '@/lib/pathenc';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/browse/raw-directory?path=...&type=images|videos
 * Returns a list of files and subdirectories at a specific path
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminKey(request);

    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get('path');
    const type = searchParams.get('type') || 'images';
    
    if (!targetPath) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }

    // Security check
    const isValid = await validateFilePath(targetPath);
    if (!isValid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }

    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
        return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
    const targetExtensions = type === 'videos' ? videoExtensions : imageExtensions;
    
    const result = items
      .map(item => {
        const fullPath = path.join(targetPath, item.name);
        try {
            const itemStats = fs.statSync(fullPath);
            const isDir = item.isDirectory();
            
            // If it's a file, check extension
            if (!isDir) {
                const ext = path.extname(item.name).toLowerCase();
                if (!targetExtensions.includes(ext)) return null;
            }

            return {
                name: item.name,
                path: fullPath,
                isDirectory: isDir,
                size: itemStats.size,
                extension: isDir ? '' : path.extname(item.name).toLowerCase(),
            };
        } catch {
            return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
          // Directories first, then alphabetical
          if (a!.isDirectory === b!.isDirectory) return a!.name.localeCompare(b!.name);
          return a!.isDirectory ? -1 : 1;
      });
    
    return NextResponse.json({
      items: result,
      currentPath: targetPath,
      parentPath: path.dirname(targetPath),
    });
    
  } catch (error) {
    console.error('Error browsing raw directory:', error);
    return NextResponse.json({ error: 'Failed to browse directory' }, { status: 500 });
  }
}
