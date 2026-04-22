import { NextRequest, NextResponse } from 'next/server';
import { getMovies } from '@/features/movie/queries/get-movies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const genre = searchParams.get('genre');
    const quality = searchParams.get('quality');
    const year = searchParams.get('year');
    const audience = searchParams.get('audience') as 'family' | 'adult' | null;
    const sort = searchParams.get('sort') as 'newest' | 'title_asc' | 'title_desc' | null;
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '24');

    const result = getMovies({ q, genre, quality, year, audience, sort, offset, limit });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch treasury entities' }, { status: 500 });
  }
}
