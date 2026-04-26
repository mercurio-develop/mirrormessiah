import { NextRequest, NextResponse } from 'next/server';
import { getSeriesList } from '@/features/series/queries/get-series';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const genre = searchParams.get('genre');
    const year = searchParams.get('year');
    const audience = searchParams.get('audience') as 'family' | 'adult' | null;
    const sort = searchParams.get('sort') as 'newest' | 'title_asc' | 'title_desc' | 'rating' | 'repair' | null;
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '24');

    const result = getSeriesList({ q, genre, year, audience, sort, offset, limit });
    
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch series' }, { status: 500 });
  }
}
