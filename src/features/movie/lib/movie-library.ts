export const MOVIE_HISTORY_KEY = 'mm_movie_history';
export const MOVIE_LIBRARY_EVENT = 'mm-movie-library-changed';

export interface MovieHistoryEntry {
  movieId: number;
  title: string;
  thumbnail: string | null;
  year: number | null;
  watchedAt: number;
}

const MAX_HISTORY = 12;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(MOVIE_LIBRARY_EVENT));
}

export function getMovieHistory(): MovieHistoryEntry[] {
  return readJson<MovieHistoryEntry[]>(MOVIE_HISTORY_KEY, []);
}

export function recordMovieWatch(entry: Omit<MovieHistoryEntry, 'watchedAt'>) {
  const now = Date.now();
  const next = [
    { ...entry, watchedAt: now },
    ...getMovieHistory().filter((item) => item.movieId !== entry.movieId),
  ].slice(0, MAX_HISTORY);
  writeJson(MOVIE_HISTORY_KEY, next);
}

export function getRecentMovies(limit = 8): MovieHistoryEntry[] {
  return getMovieHistory().slice(0, limit);
}
