import Link from 'next/link';
import { AdminCourseList } from '@/features/course/components/admin-course-list';
import { getCoursesList } from '@/features/course/queries/get-courses';

export const dynamic = 'force-dynamic';

export default async function AdminCoursesPage() {
  const { courses, total } = getCoursesList({ limit: 100 });

  return (
    <div className="flex flex-col gap-8 font-sans pb-24">
      <div className="border-l-4 border-amber-500 pl-6 py-1">
        <Link href="/admin" className="text-amber-500 text-xs font-bold uppercase tracking-widest">← Dashboard</Link>
        <h1 className="text-3xl font-black mt-2">Course Registry</h1>
        <p className="text-sm text-muted-foreground mt-1">{total} courses indexed</p>
      </div>
      <AdminCourseList initialCourses={courses as any[]} />
    </div>
  );
}
