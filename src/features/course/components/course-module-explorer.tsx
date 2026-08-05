'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Play, FolderOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  getCourseImageUrl,
  moduleFolderLabel,
  moduleKindBadge,
} from '@/features/course/lib/course-artwork';

interface Lesson {
  id: number;
  lesson_number: number;
  title: string | null;
  plot: string | null;
  runtime: number | null;
  thumbnail: string | null;
  has_file: number;
}

interface Module {
  id: number;
  module_number: number;
  module_kind: string;
  title: string | null;
  lessons: Lesson[];
}

export function CourseModuleExplorer({ modules }: { modules: Module[] }) {
  const [activeId, setActiveId] = useState<number | null>(modules[0]?.id ?? null);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const active = modules.find((m) => m.id === activeId);

  useEffect(() => {
    const saved = localStorage.getItem('mm_course_outline_collapsed');
    if (saved === 'true') setOutlineCollapsed(true);
  }, []);

  const toggleOutline = () => {
    const next = !outlineCollapsed;
    setOutlineCollapsed(next);
    localStorage.setItem('mm_course_outline_collapsed', String(next));
  };

  if (modules.length === 0) {
    return <p className="text-muted-foreground italic pb-20">No modules in this course.</p>;
  }

  return (
    <div className="pb-20">
      {/* Mobile: module picker */}
      <div className="lg:hidden mb-6">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">
          Module
        </label>
        <select
          value={activeId ?? ''}
          onChange={(e) => setActiveId(Number(e.target.value))}
          className="w-full h-12 px-4 bg-card border border-border rounded-xl text-sm font-semibold outline-none focus:border-primary"
        >
          {modules.map((mod) => (
            <option key={mod.id} value={mod.id}>
              {moduleFolderLabel(mod.module_kind, mod.module_number, mod.title)} ({mod.lessons.length})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-[420px]">
        {/* Sidebar — collapsible on desktop */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 border border-border/40 rounded-xl bg-card/30 overflow-hidden transition-[width] duration-300 ease-in-out ${
            outlineCollapsed ? 'w-14' : 'w-72'
          }`}
        >
          {outlineCollapsed ? (
            <>
              <button
                type="button"
                onClick={toggleOutline}
                title="Expand course outline"
                aria-label="Expand course outline"
                className="p-3 border-b border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <PanelLeftOpen className="h-4 w-4 mx-auto" />
              </button>
              <nav className="flex-1 overflow-y-auto p-1.5 space-y-1 max-h-[70vh] custom-scrollbar">
                {modules.map((mod) => {
                  const selected = activeId === mod.id;
                  const folder = moduleFolderLabel(mod.module_kind, mod.module_number, mod.title);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setActiveId(mod.id)}
                      title={folder}
                      aria-label={folder}
                      className={`w-full h-9 rounded-md text-xs font-black transition-all ${
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      {mod.module_number}
                    </button>
                  );
                })}
              </nav>
            </>
          ) : (
            <>
              <div className="px-3 py-3 border-b border-border/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground min-w-0">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Course outline</span>
                </div>
                <button
                  type="button"
                  onClick={toggleOutline}
                  title="Collapse course outline"
                  aria-label="Collapse course outline"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[70vh] custom-scrollbar">
                {modules.map((mod) => {
                  const selected = activeId === mod.id;
                  const folder = moduleFolderLabel(mod.module_kind, mod.module_number, mod.title);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setActiveId(mod.id)}
                      className={`w-full text-left rounded-lg px-3 py-3 transition-all border ${
                        selected
                          ? 'bg-primary/10 border-primary/30 text-foreground'
                          : 'border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            selected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {moduleKindBadge(mod.module_kind)} {mod.module_number}
                        </span>
                        <span className="text-[10px] font-bold opacity-60">{mod.lessons.length} lessons</span>
                      </div>
                      <p className="text-sm font-bold leading-snug line-clamp-2">{mod.title || folder}</p>
                      {mod.title ? (
                        <p className="text-[10px] font-mono text-muted-foreground/70 mt-1 truncate">{folder}</p>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </>
          )}
        </aside>

        {/* Lesson panel */}
        <div className="flex-1 min-w-0">
          {active ? (
            <div className="space-y-4">
              <div className="border-b border-border/20 pb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                  {moduleKindBadge(active.module_kind)} {active.module_number}
                </p>
                <h2 className="text-xl md:text-2xl font-black tracking-tight">
                  {active.title || moduleFolderLabel(active.module_kind, active.module_number, active.title)}
                </h2>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {moduleFolderLabel(active.module_kind, active.module_number, active.title)}
                </p>
              </div>

              {active.lessons.length === 0 ? (
                <p className="text-muted-foreground italic">No lessons in this module.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {active.lessons.map((les) => (
                    <Link
                      key={les.id}
                      href={`/learn/${les.id}`}
                      className={`group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 rounded-xl transition-all ${
                        les.has_file
                          ? 'hover:bg-white/5 border border-transparent hover:border-white/10'
                          : 'opacity-50 pointer-events-none'
                      }`}
                    >
                      <span className="text-2xl font-black text-muted-foreground/40 w-12 text-center shrink-0 group-hover:text-white">
                        {les.lesson_number}
                      </span>
                      <div className="relative w-32 sm:w-40 aspect-video bg-zinc-900 rounded-md overflow-hidden shrink-0 border border-white/5">
                        {les.thumbnail && getCourseImageUrl(les.thumbnail) ? (
                          <Image
                            src={getCourseImageUrl(les.thumbnail)!}
                            alt={les.title || ''}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black" />
                        )}
                        {les.has_file ? (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                            <Play className="w-8 h-8 fill-white text-white" />
                          </div>
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="text-lg font-bold truncate group-hover:text-white">
                            {les.title || `Lesson ${les.lesson_number}`}
                          </h3>
                          {les.runtime ? (
                            <span className="text-xs font-bold text-muted-foreground shrink-0">{les.runtime}m</span>
                          ) : null}
                        </div>
                        {les.plot ? (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{les.plot}</p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
