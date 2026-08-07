'use client';

import { useEffect } from 'react';
import { recordMovieWatch } from '@/features/movie/lib/movie-library';

interface MovieWatchTrackerProps {
  movieId: number;
  title: string;
  thumbnail: string | null;
  year: number | null;
}

export function MovieWatchTracker({ movieId, title, thumbnail, year }: MovieWatchTrackerProps) {
  useEffect(() => {
    recordMovieWatch({ movieId, title, thumbnail, year });
  }, [movieId, title, thumbnail, year]);

  return null;
}
