'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { COURSE_CATEGORIES } from '@/features/course/lib/course-taxonomy';
import { getCoursePosterUrl } from '@/features/course/lib/course-artwork';
import type { CourseCategoryCounts } from '@/features/course/queries/get-courses';
import {
  COURSE_SORT_OPTIONS,
  parseCourseSearchParams,
  type CourseSort,
} from '@/features/course/search-params';
import { normalizeSearchQuery } from '@/lib/search';
import {
  Search,
  Loader2,
  GraduationCap,
  LayoutGrid,
  List,
  Filter,
  X,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Dropdown } from '@/components/ui/dropdown';
import { CourseHistoryCarousel } from '@/features/course/components/course-history-carousel';
import { CourseFavoriteButton } from '@/features/course/components/course-favorite-button';

export interface Course {
  id: number;
  title: string;
  year: number | null;
  thumbnail: string | null;
  platform: string | null;
  category: string | null;
  instructor: string | null;
  needs_repair: number;
  module_count: number;
}

type ViewMode = 'grid' | 'list';

const ITEMS_PER_LOAD = 24;

export function PublicCoursesList({
  initialCourses,
  initialPlatforms = [],
  initialYears = [],
  initialTotal = 0,
  initialCategoryCounts = { total: 0, byCategory: {} },
}: {
  initialCourses: Course[];
  initialPlatforms?: string[];
  initialYears?: string[];
  initialTotal?: number;
  initialCategoryCounts?: CourseCategoryCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [sort, setSort] = useState<CourseSort>('title_asc');
  const [showFilters, setShowFilters] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [years, setYears] = useState(initialYears);

  const [courses, setCourses] = useState(initialCourses);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [categoryCounts, setCategoryCounts] = useState(initialCategoryCounts);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCourses.length >= ITEMS_PER_LOAD);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const offsetRef = useRef(initialCourses.length);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isInitialMount = useRef(true);
  const lastStateString = useRef('');
  const [restored, setRestored] = useState({ done: false, didRestore: false });

  useEffect(() => {
    const saved = localStorage.getItem('mm_courses_view');
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('mm_courses_show_filters');
    if (saved !== null) setShowFilters(saved === 'true');
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(normalizeSearchQuery(searchTerm)), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const parsed = parseCourseSearchParams(searchParams);
    setSelectedCategory(parsed.category);
    setSelectedPlatform(parsed.platform);
    setSelectedYear(parsed.year);
    setSort(parsed.sort);
    if (parsed.q) setSearchTerm(parsed.q);
  }, [searchParams]);

  const toggleFilters = () => {
    const next = !showFilters;
    setShowFilters(next);
    localStorage.setItem('mm_courses_show_filters', String(next));
  };

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('mm_courses_view', mode);
  };

  const pushFilters = useCallback(
    (updates: Partial<{ category: string; platform: string; year: string; sort: CourseSort }>) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = {
        category: updates.category ?? selectedCategory,
        platform: updates.platform ?? selectedPlatform,
        year: updates.year ?? selectedYear,
        sort: updates.sort ?? sort,
      };
      if (next.category) params.set('category', next.category);
      else params.delete('category');
      if (next.platform) params.set('platform', next.platform);
      else params.delete('platform');
      if (next.year) params.set('year', next.year);
      else params.delete('year');
      if (next.sort !== 'title_asc') params.set('sort', next.sort);
      else params.delete('sort');
      if (debouncedSearch) params.set('q', debouncedSearch);
      else params.delete('q');
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, selectedCategory, selectedPlatform, selectedYear, sort, debouncedSearch, router, pathname],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (selectedCategory) count++;
    if (selectedPlatform) count++;
    if (selectedYear) count++;
    if (sort !== 'title_asc') count++;
    return count;
  }, [debouncedSearch, selectedCategory, selectedPlatform, selectedYear, sort]);

  const categoryOptions = useMemo(() => {
    const extras = Object.keys(categoryCounts.byCategory).filter(
      (cat) => cat !== 'Uncategorized' && !(COURSE_CATEGORIES as readonly string[]).includes(cat),
    );
    const options = [
      ...COURSE_CATEGORIES.map((c) => ({ value: c, label: `${c} (${categoryCounts.byCategory[c] ?? 0})` })),
      ...(categoryCounts.byCategory['Uncategorized']
        ? [{ value: 'Uncategorized', label: `Uncategorized (${categoryCounts.byCategory['Uncategorized']})` }]
        : []),
      ...extras.map((c) => ({ value: c, label: `${c} (${categoryCounts.byCategory[c] ?? 0})` })),
    ];
    return options;
  }, [categoryCounts]);

  const fetchCourses = useCallback(
    async (reset = false): Promise<boolean> => {
      if (loadingRef.current && !reset) return false;
      if (reset && abortRef.current) abortRef.current.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      loadingRef.current = true;
      setLoading(true);

      try {
        const offset = reset ? 0 : offsetRef.current;
        let url = `/api/courses?offset=${offset}&limit=${ITEMS_PER_LOAD}&sort=${sort}`;
        if (debouncedSearch) url += `&q=${encodeURIComponent(debouncedSearch)}`;
        if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`;
        if (selectedPlatform) url += `&platform=${encodeURIComponent(selectedPlatform)}`;
        if (selectedYear) url += `&year=${encodeURIComponent(selectedYear)}`;

        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) return false;
        const data = await res.json();
        const list = (data.courses || []) as Course[];

        if (reset) {
          setCourses(list);
          offsetRef.current = list.length;
          setTotalCount(data.total ?? 0);
          if (data.categoryCounts) setCategoryCounts(data.categoryCounts);
          if (data.facets?.platforms) setPlatforms(data.facets.platforms);
          if (data.facets?.years) setYears(data.facets.years);
        } else {
          setCourses((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            return [...prev, ...list.filter((c) => !ids.has(c.id))];
          });
          offsetRef.current += list.length;
        }
        setHasMore(list.length >= ITEMS_PER_LOAD);
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return false;
        return false;
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          loadingRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [debouncedSearch, selectedCategory, selectedPlatform, selectedYear, sort],
  );

  useEffect(() => {
    let didRestore = false;
    const saved = sessionStorage.getItem('mm_courses_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSearchTerm(state.searchTerm || '');
        setDebouncedSearch(state.searchTerm || '');
        setSelectedCategory(state.selectedCategory || '');
        setSelectedPlatform(state.selectedPlatform || '');
        setSelectedYear(state.selectedYear || '');
        setSort(state.sort || 'title_asc');
        setCourses(state.courses || initialCourses);
        offsetRef.current = state.offset || initialCourses.length;
        setHasMore(state.hasMore ?? initialCourses.length >= ITEMS_PER_LOAD);
        setTotalCount(state.totalCount || 0);
        didRestore = true;
        setTimeout(() => {
          window.scrollTo({ top: state.scrollY || 0, behavior: 'instant' });
          sessionStorage.removeItem('mm_courses_state');
        }, 100);
      } catch {
        /* ignore */
      }
    }
    setRestored({ done: true, didRestore });
  }, [initialCourses]);

  useEffect(() => {
    if (!restored.done) return;

    const currentStateString = JSON.stringify({
      debouncedSearch,
      selectedCategory,
      selectedPlatform,
      selectedYear,
      sort,
    });

    const hasActiveFilters =
      debouncedSearch || selectedCategory || selectedPlatform || selectedYear || sort !== 'title_asc';

    const runResetFetch = (scrollToTop: boolean) => {
      if (scrollToTop) window.scrollTo({ top: 0, behavior: 'instant' });
      void fetchCourses(true).then((ok) => {
        if (ok) lastStateString.current = currentStateString;
      });
    };

    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (!restored.didRestore || hasActiveFilters) runResetFetch(false);
      else lastStateString.current = currentStateString;
      return;
    }

    if (currentStateString === lastStateString.current) return;
    runResetFetch(true);
  }, [debouncedSearch, selectedCategory, selectedPlatform, selectedYear, sort, restored, fetchCourses]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchCourses(false);
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.unobserve(sentinel);
  }, [hasMore, loading, fetchCourses]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedPlatform('');
    setSelectedYear('');
    setSort('title_asc');
    router.push(pathname, { scroll: false });
  };

  const saveStateAndScroll = () => {
    sessionStorage.setItem(
      'mm_courses_state',
      JSON.stringify({
        courses,
        offset: offsetRef.current,
        hasMore,
        totalCount,
        scrollY: window.scrollY,
        searchTerm,
        selectedCategory,
        selectedPlatform,
        selectedYear,
        sort,
      }),
    );
  };

  return (
    <div className="space-y-10 pb-24 pt-0">
      <div
        className={`sticky top-20 z-50 bg-background transition-all duration-300 overflow-visible py-6 ${
          isScrolled ? 'shadow-2xl border-b border-white/[0.04]' : 'border-b border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                <GraduationCap className="h-7 w-7 text-primary" /> Courses
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-muted/20 border border-border/40 rounded-xl">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  aria-label="List view"
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="relative flex-1 max-w-2xl group">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary">
                {loading ? <Loader2 className="h-full w-full animate-spin" /> : <Search className="h-full w-full" />}
              </div>
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 bg-transparent pl-8 pr-12 font-bold tracking-tight text-lg placeholder:text-muted-foreground/20 focus:outline-none border-b border-border/40 focus:border-primary transition-colors"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-full text-muted-foreground/40 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <div
                className={`flex items-center bg-muted/20 border border-border/40 rounded-xl p-1 gap-1 ${!showFilters ? 'shadow-lg shadow-primary/5 border-primary/20' : ''}`}
              >
                <button
                  type="button"
                  onClick={toggleFilters}
                  className={`flex items-center gap-2.5 px-4 h-9 rounded-lg transition-all ${
                    showFilters
                      ? 'bg-white/[0.03] border border-white/[0.08] text-foreground/80'
                      : 'text-muted-foreground/60 hover:text-foreground/80'
                  }`}
                >
                  <Filter className={`h-3.5 w-3.5 ${showFilters ? 'rotate-180' : 'text-primary'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${!showFilters ? 'text-primary/70' : ''}`}>
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </span>
                  {activeFilterCount > 0 && !showFilters ? (
                    <span className="flex items-center justify-center min-w-[16px] h-[16px] bg-primary text-primary-foreground text-[8px] rounded-full px-1">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>
                <div className="h-4 w-px bg-border/30 mx-0.5" />
                <div className="px-4 h-9 flex items-center">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 whitespace-nowrap">
                    {totalCount} courses
                  </span>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {showFilters ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-visible"
              >
                <LayoutGroup>
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-6 pb-2">
                    <Dropdown
                      label="Order"
                      value={sort}
                      onChange={(val) => {
                        setSort(val as CourseSort);
                        pushFilters({ sort: val as CourseSort });
                      }}
                      options={COURSE_SORT_OPTIONS}
                      className="w-44"
                    />
                    <Dropdown
                      label="Category"
                      placeholder="All Categories"
                      value={selectedCategory}
                      onChange={(val) => {
                        setSelectedCategory(val);
                        pushFilters({ category: val });
                      }}
                      options={categoryOptions}
                      className="w-52"
                    />
                    <Dropdown
                      label="Platform"
                      placeholder="All Platforms"
                      value={selectedPlatform}
                      onChange={(val) => {
                        setSelectedPlatform(val);
                        pushFilters({ platform: val });
                      }}
                      options={platforms.map((p) => ({ value: p, label: p }))}
                      className="w-44"
                    />
                    <Dropdown
                      label="Year"
                      placeholder="All Years"
                      value={selectedYear}
                      onChange={(val) => {
                        setSelectedYear(val);
                        pushFilters({ year: val });
                      }}
                      options={years.slice(0, 50).map((y) => ({ value: y, label: y }))}
                      className="w-36"
                    />
                    {activeFilterCount > 0 ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="h-11 px-6 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-destructive hover:text-white transition-all shrink-0"
                      >
                        <X className="h-3.5 w-3.5 mr-2 inline-block" />
                        Reset All Filters
                      </button>
                    ) : null}
                  </div>
                </LayoutGroup>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 space-y-8">
        <CourseHistoryCarousel />

        {courses.length === 0 && !loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No courses match your filters.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                onClick={saveStateAndScroll}
                className="group space-y-3 relative"
              >
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CourseFavoriteButton courseId={course.id} />
                </div>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
                  <Image
                    src={getCoursePosterUrl(course.thumbnail)}
                    alt={course.title}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                  {course.category ? (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[9px] font-bold uppercase tracking-wider text-white">
                      {course.category}
                    </span>
                  ) : null}
                  {course.needs_repair ? (
                    <div className="absolute bottom-2 right-2 p-1 bg-destructive rounded-full">
                      <AlertCircle className="h-3 w-3 text-white" />
                    </div>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">
                    {course.title}
                  </h3>
                  {course.platform ? (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                      {course.platform}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-border/20 pt-2">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                onClick={saveStateAndScroll}
                className="group flex items-center gap-4 sm:gap-5 p-3 sm:p-4 rounded-xl hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all relative"
              >
                <div className="absolute top-3 right-3 z-10">
                  <CourseFavoriteButton courseId={course.id} />
                </div>
                <div className="relative w-28 sm:w-36 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50">
                  <Image src={getCoursePosterUrl(course.thumbnail)} alt="" fill unoptimized className="object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-bold leading-snug group-hover:text-primary transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    {course.platform ? <span className="font-bold uppercase tracking-wider">{course.platform}</span> : null}
                    {course.category ? <span>{course.category}</span> : null}
                    {course.year ? <span>{course.year}</span> : null}
                    {course.module_count ? <span>{course.module_count} modules</span> : null}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {loading && courses.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {hasMore ? (
          <div ref={loadMoreRef} className="mt-12 flex justify-center pb-20">
            {loading ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <div className="h-10" />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
