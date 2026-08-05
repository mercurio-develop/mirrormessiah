'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, RotateCcw } from 'lucide-react';
import { COURSE_LIBRARY_EVENT, getCourseHistory } from '@/features/course/lib/course-library';

export function CourseStartOrContinue({
  courseId,
  firstLessonId,
}: {
  courseId: number;
  firstLessonId: number | null;
}) {
  const [continueLessonId, setContinueLessonId] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      const entry = getCourseHistory().find((item) => item.courseId === courseId);
      setContinueLessonId(entry?.lessonId ?? null);
    };
    sync();
    window.addEventListener(COURSE_LIBRARY_EVENT, sync);
    return () => window.removeEventListener(COURSE_LIBRARY_EVENT, sync);
  }, [courseId]);

  const targetId = continueLessonId ?? firstLessonId;
  if (!targetId) return null;

  const continuing = continueLessonId !== null;

  return (
    <Link
      href={`/learn/${targetId}`}
      className="inline-flex items-center gap-2 h-12 px-8 bg-white text-black font-bold rounded-lg hover:bg-white/90"
    >
      {continuing ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
      {continuing ? 'Continue Course' : 'Start Course'}
    </Link>
  );
}
