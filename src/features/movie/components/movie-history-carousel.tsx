'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { b64urlEncode } from '@/lib/b64url';
import { Clock, Play, RotateCcw } from 'lucide-react';
import { HistoryCarouselRow } from '@/components/history-carousel-row';
import {
  formatProgressLabel,
  getPlaybackProgressSeconds,
  moviePlaybackKey,
} from '@/lib/playback-progress';
import {
  getRecentMovies,
  MOVIE_LIBRARY_EVENT,
  type MovieHistoryEntry,
} from '@/features/movie/lib/movie-library';
import type { MovieWithFile } from '@/lib/types';

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

function ContinueCard({ entry, movie }: { entry: MovieHistoryEntry; movie?: MovieWithFile }) {
  const thumbnail = movie?.thumbnail ?? entry.thumbnail;
  const title = movie?.title ?? entry.title;
  const year = movie?.year ?? entry.year;
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  useEffect(() => {
    setProgressLabel(formatProgressLabel(getPlaybackProgressSeconds(moviePlaybackKey(entry.movieId))));
  }, [entry.movieId]);

  return (
    <Link
      href={`/watch/${entry.movieId}`}
      className="group snap-start shrink-0 w-36 sm:w-44 space-y-3"
    >
      <div className="relative aspect-poster rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
        <Image src={getPosterUrl(thumbnail)} alt={title} fill unoptimized className="object-cover" />
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
        {year ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{year}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function MovieHistoryCarousel() {
  const [history, setHistory] = useState<MovieHistoryEntry[]>([]);
  const [movieMap, setMovieMap] = useState<Record<number, MovieWithFile>>({});

  const refresh = useCallback(async () => {
    const recent = getRecentMovies();
    setHistory(recent);

    const ids = recent.map((item) => item.movieId);
    if (ids.length === 0) {
      setMovieMap({});
      return;
    }

    try {
      const res = await fetch(`/api/movies?ids=${ids.join(',')}`);
      const data = await res.json();
      const movies = (data.movies || []) as MovieWithFile[];
      setMovieMap(Object.fromEntries(movies.map((movie) => [movie.id, movie])));
    } catch {
      setMovieMap({});
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(MOVIE_LIBRARY_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(MOVIE_LIBRARY_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  if (history.length === 0) return null;

  return (
    <HistoryCarouselRow
      title="Continue Watching"
      icon={<Clock className="h-4 w-4 text-primary" />}
    >
      {history.map((entry) => (
        <ContinueCard key={entry.movieId} entry={entry} movie={movieMap[entry.movieId]} />
      ))}
    </HistoryCarouselRow>
  );
}
