import { NextRequest, NextResponse } from 'next/server';
import { getMoviePlayback } from '@/features/movie/queries/get-movie-playback';

/**
 * GET /api/movies/[id]/play
 * Returns playback source and subtitles for a movie
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);
    if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    
    // Use the robust playback query which handles fallback logic (720p, MKV, etc.)
    const playback = getMoviePlayback(movieId);
    
    if (!playback) {
      return NextResponse.json({ error: 'No compatible media found for playback' }, { status: 404 });
    }

    return NextResponse.json(playback);
  } catch (error) {
    console.error('[PlayAPI] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
