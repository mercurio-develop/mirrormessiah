import { PublicCoursesList } from '@/features/course/components/public-courses-list';
import { getCoursesList, getCourseFacets } from '@/features/course/queries/get-courses';
import { DEFAULT_COURSE_SORT } from '@/features/course/search-params';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
  const { courses, total, categoryCounts } = getCoursesList({ limit: 24, sort: DEFAULT_COURSE_SORT });
  const { platforms, years } = getCourseFacets();
  return (
    <div className="min-h-screen bg-background pt-18 pb-12">
      <Suspense fallback={<div className="px-6 text-muted-foreground">Loading courses...</div>}>
        <PublicCoursesList
          initialCourses={courses as any[]}
          initialPlatforms={platforms}
          initialYears={years}
          initialTotal={total}
          initialCategoryCounts={categoryCounts}
        />
      </Suspense>
    </div>
  );
}
