import { PublicCoursesList } from '@/features/course/components/public-courses-list';
import { getCoursesList, getCourseFacets } from '@/features/course/queries/get-courses';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
  const { courses } = getCoursesList({ limit: 24 });
  const { platforms } = getCourseFacets();
  return (
    <div className="min-h-screen bg-background pt-18 pb-12">
      <Suspense fallback={<div className="px-6 text-muted-foreground">Loading courses...</div>}>
        <PublicCoursesList initialCourses={courses as any[]} initialPlatforms={platforms} />
      </Suspense>
    </div>
  );
}
