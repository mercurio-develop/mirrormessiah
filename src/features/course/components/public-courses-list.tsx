'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { b64urlEncode } from '@/lib/b64url';
import { COURSE_CATEGORIES } from '@/features/course/lib/course-taxonomy';
import { Search, Loader2, GraduationCap } from 'lucide-react';

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

export function PublicCoursesList({
  initialCourses,
  initialPlatforms = [],
}: {
  initialCourses: Course[];
  initialPlatforms?: string[];
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(initialCourses.length);
  const [hasMore, setHasMore] = useState(initialCourses.length >= 24);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCourses = useCallback(async (reset = false) => {
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
      setLoading(false);
    }
  }, [debounced, category, platform]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchCourses(true);
  }, [debounced, category, platform, fetchCourses]);

  return (
    <div className="px-4 sm:px-6 space-y-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" /> Courses
        </h1>
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
            All
          </button>
          {COURSE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(category === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {cat}
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

      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : null}
      {hasMore && !loading ? (
        <div className="flex justify-center pb-12">
          <button onClick={() => fetchCourses(false)} className="px-6 py-3 bg-card border border-border rounded-xl text-sm font-bold hover:border-primary">
            Load more
          </button>
        </div>
      ) : null}
    </div>
  );
}
