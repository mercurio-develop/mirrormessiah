import { NextRequest, NextResponse } from 'next/server';
import { getEpisodesByIds } from '@/features/series/queries/get-episodes-by-ids';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
    }

    const ids = idsParam
      .split(',')
      .map((value) => parseInt(value.trim(), 10))
      .filter((id) => !Number.isNaN(id));

    const episodes = getEpisodesByIds(ids);
    return NextResponse.json({ episodes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch episodes' }, { status: 500 });
  }
}
