import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/movies/[id]/vlc.m3u
 * Generates an M3U playlist to open the movie directly in VLC
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    const db = getDb();
    
    const movie = db.prepare('SELECT title FROM movies WHERE id = ?').get(movieId) as any;
    const file = db.prepare('SELECT path FROM files WHERE movie_id = ? LIMIT 1').get(movieId) as any;

    if (!movie || !file) {
      return new NextResponse('Movie not found', { status: 404 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    // Create base64 encoded path for our stream API
    const encodedPath = Buffer.from(file.path).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const streamUrl = `${protocol}://${host}/api/stream?path=${encodedPath}`;

    // M3U Format
    const m3uContent = `#EXTM3U\n#EXTINF:-1,${movie.title}\n${streamUrl}`;

    return new NextResponse(m3uContent, {
      headers: {
        'Content-Type': 'application/x-mpegurl',
        'Content-Disposition': `attachment; filename="${movie.title.replace(/[^a-z0-9]/gi, '_')}.m3u"`,
      },
    });

  } catch (error) {
    return new NextResponse('Error generating playlist', { status: 500 });
  }
}
