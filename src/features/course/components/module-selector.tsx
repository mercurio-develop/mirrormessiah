'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';
import Image from 'next/image';

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
  poster: string | null;
  lessons: Lesson[];
}

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
  if (!thumbnail) return null;
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

function moduleLabel(mod: Module): string {
  if (mod.title) return mod.title;
  const kind = mod.module_kind === 'week' ? 'Week' : mod.module_kind === 'chapter' ? 'Chapter' : 'Module';
  return `${kind} ${mod.module_number}`;
}

export function ModuleSelector({ modules }: { modules: Module[] }) {
  const [activeId, setActiveId] = useState<number | null>(modules[0]?.id ?? null);
  const active = modules.find((m) => m.id === activeId);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-6 overflow-x-auto pb-2 scrollbar-hide border-b border-border/20">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setActiveId(mod.id)}
            className={`shrink-0 text-lg md:text-xl font-bold tracking-tight pb-3 border-b-4 transition-all duration-300 ${
              activeId === mod.id ? 'border-white text-white' : 'border-transparent text-muted-foreground hover:text-white/80'
            }`}
          >
            {moduleLabel(mod)}
            <span className="ml-1.5 text-sm font-normal opacity-60">({mod.lessons.length})</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="flex flex-col gap-2 border-t border-border/10 pt-2">
          {active.poster && getPosterUrl(active.poster) ? (
            <div className="relative w-full max-w-md aspect-video bg-zinc-900 rounded-lg overflow-hidden mb-4 border border-white/5">
              <Image src={getPosterUrl(active.poster)!} alt={moduleLabel(active)} fill className="object-contain" unoptimized />
            </div>
          ) : null}
          {active.lessons.length === 0 ? (
            <p className="text-muted-foreground italic">No lessons in this module.</p>
          ) : (
            active.lessons.map((les) => (
              <Link
                key={les.id}
                href={`/learn/${les.id}`}
                className={`group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 rounded-xl transition-all ${
                  les.has_file ? 'hover:bg-white/5 border border-transparent hover:border-white/10' : 'opacity-50 pointer-events-none'
                }`}
              >
                <span className="text-2xl font-black text-muted-foreground/40 w-12 text-center shrink-0 group-hover:text-white">
                  {les.lesson_number}
                </span>
                <div className="relative w-32 sm:w-40 aspect-video bg-zinc-900 rounded-md overflow-hidden shrink-0 border border-white/5">
                  {les.thumbnail && getPosterUrl(les.thumbnail) ? (
                    <Image src={getPosterUrl(les.thumbnail)!} alt={les.title || ''} fill className="object-contain" unoptimized />
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
                  <h3 className="text-lg font-bold truncate group-hover:text-white">{les.title || `Lesson ${les.lesson_number}`}</h3>
                  {les.plot ? <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{les.plot}</p> : null}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
