import { NextRequest, NextResponse } from 'next/server';
import { getCoursesList } from '@/features/course/queries/get-courses';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const platform = searchParams.get('platform');
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') as 'newest' | 'title_asc' | 'title_desc' | 'repair' | null;
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '24');

    const result = getCoursesList({ q, platform, category, sort, offset, limit });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}
