export type CourseSort = 'title_asc' | 'title_desc' | 'newest' | 'repair';

export interface CourseSearchParams {
  q: string;
  category: string;
  platform: string;
  year: string;
  sort: CourseSort;
}

export const COURSE_SORT_OPTIONS: { value: CourseSort; label: string }[] = [
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
  { value: 'newest', label: 'Latest Added' },
  { value: 'repair', label: 'Needs Repair' },
];

export function parseCourseSearchParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): CourseSearchParams {
  const sort = searchParams.get('sort') as CourseSort | null;
  const validSort = COURSE_SORT_OPTIONS.some((o) => o.value === sort) ? sort! : 'title_asc';
  return {
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    platform: searchParams.get('platform') || '',
    year: searchParams.get('year') || '',
    sort: validSort,
  };
}

export function courseFiltersToQueryString(filters: Partial<CourseSearchParams>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.year) params.set('year', filters.year);
  if (filters.sort && filters.sort !== 'title_asc') params.set('sort', filters.sort);
  return params.toString();
}
