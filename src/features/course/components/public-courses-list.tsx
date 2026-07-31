'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { b64urlEncode } from '@/lib/b64url';
import { COURSE_CATEGORIES } from '@/features/course/lib/course-taxonomy';
import type { CourseCategoryCounts } from '@/features/course/queries/get-courses';
import { Search, Loader2, GraduationCap, LayoutGrid, List } from 'lucide-react';

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

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

type ViewMode = 'grid' | 'list';

export function PublicCoursesList({
  initialCourses,
  initialPlatforms = [],
  initialTotal = 0,
  initialCategoryCounts = { total: 0, byCategory: {} },
}: {
  initialCourses: Course[];
  initialPlatforms?: string[];
  initialTotal?: number;
  initialCategoryCounts?: CourseCategoryCounts;
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [categoryCounts, setCategoryCounts] = useState(initialCategoryCounts);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(initialCourses.length);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const [hasMore, setHasMore] = useState(initialCourses.length >= 24);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    const saved = localStorage.getItem('mm_courses_view');
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
  }, []);

  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('mm_courses_view', mode);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCourses = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const offset = reset ? 0 : offsetRef.current;
      let url = `/api/courses?offset=${offset}&limit=24&sort=title_asc`;
      if (debounced) url += `&q=${encodeURIComponent(debounced)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (platform) url += `&platform=${encodeURIComponent(platform)}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = data.courses || [];
      setCourses((prev) => (reset ? list : [...prev, ...list]));
      offsetRef.current = reset ? list.length : offsetRef.current + list.length;
      setHasMore(list.length >= 24);
      if (reset) {
        setTotalCount(data.total ?? 0);
        if (data.categoryCounts) setCategoryCounts(data.categoryCounts);
      }

      setPlatforms((prev) => {
        const seen = new Set(prev);
        for (const c of list as Course[]) {
          if (c.platform) seen.add(c.platform);
        }
        const next = [...seen].sort();
        if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
          return prev;
        }
        return next;
      });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [debounced, category, platform]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchCourses(true);
  }, [debounced, category, platform, fetchCourses]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchCourses(false);
        }
      },
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.unobserve(sentinel);
  }, [hasMore, loading, fetchCourses, debounced, category, platform]);

  const categoryCount = (cat: string) => categoryCounts.byCategory[cat] ?? 0;
  const uncategorizedCount = categoryCounts.byCategory['Uncategorized'] ?? 0;
  const extraCategories = Object.keys(categoryCounts.byCategory).filter(
    (cat) => cat !== 'Uncategorized' && !(COURSE_CATEGORIES as readonly string[]).includes(cat),
  );

  return (
    <div className="px-4 sm:px-6 space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-primary" /> Courses
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{totalCount}</span>
              {' '}{totalCount === 1 ? 'course' : 'courses'}
              {category ? (
                <span> in <span className="font-semibold text-foreground">{category}</span></span>
              ) : null}
              {platform ? (
                <span> · <span className="font-semibold text-foreground">{platform}</span></span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-card border border-border rounded-xl">
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
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses..."
            className="w-full h-12 pl-11 pr-4 bg-card border border-border rounded-xl text-sm font-medium outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${category === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'}`}
          >
            All ({categoryCounts.total})
          </button>
          {COURSE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(category === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {cat} ({categoryCount(cat)})
            </button>
          ))}
          {uncategorizedCount > 0 ? (
            <button
              type="button"
              onClick={() => setCategory(category === 'Uncategorized' ? null : 'Uncategorized')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${category === 'Uncategorized' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'}`}
            >
              Uncategorized ({uncategorizedCount})
            </button>
          ) : null}
          {extraCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(category === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {cat} ({categoryCount(cat)})
            </button>
          ))}
        </div>
        {platforms.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(platform === p ? null : p)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors ${platform === p ? 'bg-amber-600 text-white border-amber-600' : 'bg-muted/40 border-border text-muted-foreground hover:border-amber-500/50'}`}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {courses.length === 0 && !loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No courses match your filters.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {courses.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`} className="group space-y-3">
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
                <Image src={getPosterUrl(course.thumbnail)} alt={course.title} fill unoptimized className="object-contain" />
                {course.category ? (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[9px] font-bold uppercase tracking-wider text-white">
                    {course.category}
                  </span>
                ) : null}
              </div>
              <div>
                <h3 className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">{course.title}</h3>
                {course.platform ? <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{course.platform}</p> : null}
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
              className="group flex items-center gap-4 sm:gap-5 p-3 sm:p-4 rounded-xl hover:bg-muted/40 border border-transparent hover:border-border/50 transition-all"
            >
              <div className="relative w-28 sm:w-36 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50">
                <Image src={getPosterUrl(course.thumbnail)} alt="" fill unoptimized className="object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold leading-snug group-hover:text-primary transition-colors">
                  {course.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {course.platform ? <span className="font-bold uppercase tracking-wider">{course.platform}</span> : null}
                  {course.category ? <span>{course.category}</span> : null}
                  {course.module_count ? <span>{course.module_count} modules</span> : null}
                  {course.instructor ? <span className="hidden sm:inline">{course.instructor}</span> : null}
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
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] animate-pulse">
                Loading courses...
              </span>
            </div>
          ) : (
            <div className="h-10" />
          )}
        </div>
      ) : null}
    </div>
  );
}
