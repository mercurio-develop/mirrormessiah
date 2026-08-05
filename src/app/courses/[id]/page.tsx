import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, GraduationCap } from 'lucide-react';
import { getCourseDetails } from '@/features/course/queries/get-course-details';
import { CourseModuleExplorer } from '@/features/course/components/course-module-explorer';
import { CourseFavoriteButton } from '@/features/course/components/course-favorite-button';
import { CourseStartOrContinue } from '@/features/course/components/course-start-or-continue';
import { getCourseImageUrl } from '@/features/course/lib/course-artwork';

export const dynamic = 'force-dynamic';

export default async function CourseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = parseInt(id);
  if (isNaN(courseId)) notFound();
  const course = getCourseDetails(courseId);
  if (!course) notFound();

  let firstLessonId: number | null = null;
  if (course.modules.length > 0) {
    const firstMod = course.modules[0];
    if (firstMod.lessons.length > 0) {
      firstLessonId = [...firstMod.lessons].sort((a, b) => a.lesson_number - b.lesson_number)[0].id;
    }
  }

  const posterUrl = getCourseImageUrl(course.thumbnail);

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="relative h-[50vh] flex items-end">
        {posterUrl ? (
          <Image src={posterUrl} alt="" fill unoptimized className="object-contain opacity-30 blur-sm" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-12">
          <Link href="/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
            <ChevronLeft className="h-5 w-5" /> Back to Courses
          </Link>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight">{course.title}</h1>
          <div className="flex flex-wrap gap-3 mt-4 text-sm font-bold text-muted-foreground">
            {course.category ? <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs uppercase tracking-wider">{course.category}</span> : null}
            {course.platform ? <span className="flex items-center gap-1"><GraduationCap className="h-4 w-4" />{course.platform}</span> : null}
            <span>{course.modules.length} modules</span>
          </div>
          {course.plot ? <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">{course.plot}</p> : null}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <CourseStartOrContinue courseId={course.id} firstLessonId={firstLessonId} />
            <CourseFavoriteButton courseId={course.id} label />
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-12">
        <CourseModuleExplorer modules={course.modules} />
      </div>
    </div>
  );
}
