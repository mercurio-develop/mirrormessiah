import { NextRequest, NextResponse } from 'next/server';
import { getCoursesList, getCoursesByIds } from '@/features/course/queries/get-courses';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((id) => !Number.isNaN(id));
      const courses = getCoursesByIds(ids);
      return NextResponse.json({ courses }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const q = searchParams.get('q');
    const platform = searchParams.get('platform');
    const category = searchParams.get('category');
    const year = searchParams.get('year');
    const sort = searchParams.get('sort') as 'newest' | 'title_asc' | 'title_desc' | 'repair' | null;
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '24');

    const result = getCoursesList({ q, platform, category, year, sort, offset, limit });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}
