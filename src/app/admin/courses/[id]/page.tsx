import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminCourseForm } from '@/features/course/components/admin-course-form';
import { getCourseDetails } from '@/features/course/queries/get-course-details';

export const dynamic = 'force-dynamic';

export default async function AdminCourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = parseInt(id);
  if (isNaN(courseId)) notFound();
  const course = getCourseDetails(courseId);
  if (!course) notFound();

  return (
    <div className="flex flex-col gap-8 pb-24">
      <div className="border-l-4 border-amber-500 pl-6">
        <Link href="/admin/courses" className="text-amber-500 text-xs font-bold uppercase tracking-widest">← Registry</Link>
        <h1 className="text-3xl font-black mt-2">{course.title as string}</h1>
      </div>
      <AdminCourseForm course={course} />
    </div>
  );
}
