'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { b64urlEncode } from '@/lib/b64url';
import { Search, Edit, Loader2, GraduationCap, RefreshCw, Trash2 } from 'lucide-react';
import { validateCourseThumbnailsAction } from '../actions/validate-course-thumbnails';
import { deleteCourseAction } from '../actions/delete-course';

interface CourseRow {
  id: number;
  title: string;
  thumbnail: string | null;
  platform: string | null;
  category: string | null;
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

export function AdminCourseList({ initialCourses }: { initialCourses: CourseRow[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/courses?limit=100&sort=title_asc';
      if (debounced) url += `&q=${encodeURIComponent(debounced)}`;
      const res = await fetch(url);
      const data = await res.json();
      setCourses(data.courses || []);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleValidate = async () => {
    setValidating(true);
    const res = await validateCourseThumbnailsAction();
    alert(res.message);
    setValidating(false);
    fetchCourses();
  };

  const handleBulkDelete = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} courses from registry?`)) return;
    await deleteCourseAction(Array.from(selected));
    setSelected(new Set());
    fetchCourses();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..." className="w-full h-11 pl-10 pr-4 border border-border rounded-xl bg-card text-sm" />
        </div>
        <button onClick={handleValidate} disabled={validating} className="h-11 px-4 border border-border rounded-xl text-sm font-bold flex items-center gap-2">
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Validate Artwork
        </button>
        {selected.size > 0 ? (
          <button onClick={handleBulkDelete} className="h-11 px-4 border border-destructive/30 text-destructive rounded-xl text-sm font-bold flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Delete ({selected.size})
          </button>
        ) : null}
      </div>

      {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courses.map((course) => (
          <div key={course.id} className="flex gap-4 p-4 bg-card border border-border rounded-2xl">
            <input type="checkbox" checked={selected.has(course.id)} onChange={() => {
              const next = new Set(selected);
              if (next.has(course.id)) next.delete(course.id); else next.add(course.id);
              setSelected(next);
            }} />
            <div className="relative w-24 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted">
              <Image src={getPosterUrl(course.thumbnail)} alt="" fill unoptimized className="object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold truncate">{course.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {[course.platform || 'Unknown platform', course.category, `${course.module_count} modules`].filter(Boolean).join(' · ')}
              </p>
              <Link href={`/admin/courses/${course.id}`} className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-amber-500 hover:text-amber-400">
                <Edit className="h-3 w-3" /> Edit
              </Link>
            </div>
          </div>
        ))}
      </div>
      {courses.length === 0 && !loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No courses indexed. Run <code>courses_cli sync</code> from the terminal.</p>
        </div>
      ) : null}
    </div>
  );
}
