'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import {
  COURSE_LIBRARY_EVENT,
  isCourseFavorite,
  toggleCourseFavorite,
} from '@/features/course/lib/course-library';

interface CourseFavoriteButtonProps {
  courseId: number;
  className?: string;
  label?: boolean;
}

export function CourseFavoriteButton({ courseId, className = '', label = false }: CourseFavoriteButtonProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isCourseFavorite(courseId));
    const sync = () => setActive(isCourseFavorite(courseId));
    window.addEventListener(COURSE_LIBRARY_EVENT, sync);
    return () => window.removeEventListener(COURSE_LIBRARY_EVENT, sync);
  }, [courseId]);

  return (
    <button
      type="button"
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(toggleCourseFavorite(courseId));
      }}
      className={`inline-flex items-center gap-2 rounded-full border transition-all ${
        active
          ? 'border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
          : 'border-white/10 bg-white/5 text-muted-foreground hover:text-rose-300 hover:border-rose-500/30'
      } ${label ? 'px-4 py-2 text-xs font-bold uppercase tracking-wider' : 'p-2.5'} ${className}`}
    >
      <Heart className={`h-4 w-4 ${active ? 'fill-current' : ''}`} />
      {label ? (active ? 'Favorited' : 'Favorite') : null}
    </button>
  );
}
