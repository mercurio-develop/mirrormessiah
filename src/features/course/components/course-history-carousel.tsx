'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { b64urlEncode } from '@/lib/b64url';
import { Clock, Heart, Play, RotateCcw } from 'lucide-react';
import {
  COURSE_LIBRARY_EVENT,
  formatProgressLabel,
  getCourseFavorites,
  getLessonProgressSeconds,
  getRecentCourses,
  type CourseHistoryEntry,
} from '@/features/course/lib/course-library';
import type { Course } from '@/features/course/components/public-courses-list';

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

function CarouselRow({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  empty?: string;
  children: ReactNode;
}) {
  const childCount = Array.isArray(children) ? children.length : children ? 1 : 0;
  if (childCount === 0 && empty) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground/70">{empty}</p>
      </section>
    );
  }
  if (childCount === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-1 px-1">
        {children}
      </div>
    </section>
  );
}

function ContinueCard({ entry, course }: { entry: CourseHistoryEntry; course?: Course }) {
  const thumbnail = course?.thumbnail ?? entry.thumbnail;
  const title = course?.title ?? entry.courseTitle;
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  useEffect(() => {
    setProgressLabel(formatProgressLabel(getLessonProgressSeconds(entry.lessonId)));
  }, [entry.lessonId]);

  return (
    <Link
      href={`/learn/${entry.lessonId}`}
      className="group snap-start shrink-0 w-56 sm:w-64 space-y-3"
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
        <Image src={getPosterUrl(thumbnail)} alt={title} fill unoptimized className="object-contain" />
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 text-[9px] font-bold uppercase tracking-wider text-white flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Continue
        </span>
        {progressLabel ? (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-white">
            {progressLabel}
          </span>
        ) : null}
      </div>
      <div>
        <h3 className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 line-clamp-1">
          M{entry.moduleNumber} · L{entry.lessonNumber}
          {entry.lessonTitle ? ` · ${entry.lessonTitle}` : ''}
        </p>
      </div>
    </Link>
  );
}

function FavoriteCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="group snap-start shrink-0 w-44 sm:w-52 space-y-3"
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
        <Image src={getPosterUrl(course.thumbnail)} alt={course.title} fill unoptimized className="object-contain" />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-rose-500/90 text-[9px] font-bold uppercase tracking-wider text-white flex items-center gap-1">
          <Heart className="h-3 w-3 fill-current" /> Favorite
        </span>
      </div>
      <div>
        <h3 className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">{course.title}</h3>
        {course.platform ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{course.platform}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function CourseHistoryCarousel() {
  const [history, setHistory] = useState<CourseHistoryEntry[]>([]);
  const [favoriteCourses, setFavoriteCourses] = useState<Course[]>([]);
  const [courseMap, setCourseMap] = useState<Record<number, Course>>({});

  const refresh = useCallback(async () => {
    const recent = getRecentCourses();
    const favoriteIds = getCourseFavorites();
    setHistory(recent);

    const ids = [...new Set([...recent.map((item) => item.courseId), ...favoriteIds])];
    if (ids.length === 0) {
      setFavoriteCourses([]);
      setCourseMap({});
      return;
    }

    try {
      const res = await fetch(`/api/courses?ids=${ids.join(',')}`);
      const data = await res.json();
      const courses = (data.courses || []) as Course[];
      const map = Object.fromEntries(courses.map((course) => [course.id, course]));
      setCourseMap(map);
      setFavoriteCourses(favoriteIds.map((id) => map[id]).filter(Boolean));
    } catch {
      setFavoriteCourses([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(COURSE_LIBRARY_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(COURSE_LIBRARY_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  if (history.length === 0 && favoriteCourses.length === 0) return null;

  return (
    <div className="space-y-8 pb-2">
      <CarouselRow
        title="Continue Watching"
        icon={<Clock className="h-4 w-4 text-primary" />}
        empty="Start a lesson and it will show up here."
      >
        {history.map((entry) => (
          <ContinueCard key={`${entry.courseId}-${entry.lessonId}`} entry={entry} course={courseMap[entry.courseId]} />
        ))}
      </CarouselRow>

      <CarouselRow
        title="Favorites"
        icon={<Heart className="h-4 w-4 text-rose-400 fill-rose-400" />}
        empty="Tap the heart on a course to save it here."
      >
        {favoriteCourses.map((course) => (
          <FavoriteCard key={course.id} course={course} />
        ))}
      </CarouselRow>
    </div>
  );
}
