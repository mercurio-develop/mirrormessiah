import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getCourseFiles } from '@/features/course/queries/get-course-files';

export const GET = withAdminAuth(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const courseId = parseInt(id);
    if (isNaN(courseId)) {
      return NextResponse.json({ error: 'Invalid course id' }, { status: 400 });
    }

    const data = getCourseFiles(courseId);
    if (!data) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch course files' }, { status: 500 });
  }
});
