export type MovieSort = 'title_asc' | 'title_desc' | 'newest' | 'rating' | 'repair';

export const DEFAULT_MOVIE_SORT: MovieSort = 'newest';

export const MOVIE_SORT_OPTIONS: { value: MovieSort; label: string }[] = [
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
  { value: 'newest', label: 'Latest Added' },
  { value: 'rating', label: 'Top Rated' },
];

export function parseMovieSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): { sort: MovieSort } {
  const sort = searchParams.get('sort') as MovieSort | null;
  const validSort = MOVIE_SORT_OPTIONS.some((o) => o.value === sort) ? sort! : DEFAULT_MOVIE_SORT;
  return { sort: validSort };
}
