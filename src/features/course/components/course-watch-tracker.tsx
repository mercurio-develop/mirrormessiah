'use client';

import { useEffect } from 'react';
import { recordCourseWatch } from '@/features/course/lib/course-library';

interface CourseWatchTrackerProps {
  courseId: number;
  lessonId: number;
  courseTitle: string;
  lessonTitle: string | null;
  moduleNumber: number;
  lessonNumber: number;
  thumbnail: string | null;
}

export function CourseWatchTracker(props: CourseWatchTrackerProps) {
  useEffect(() => {
    recordCourseWatch(props);
  }, [
    props.courseId,
    props.lessonId,
    props.courseTitle,
    props.lessonTitle,
    props.moduleNumber,
    props.lessonNumber,
    props.thumbnail,
  ]);

  return null;
}
