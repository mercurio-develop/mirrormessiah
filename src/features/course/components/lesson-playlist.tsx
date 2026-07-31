'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';

interface PlaylistLesson {
  id: number;
  title: string | null;
  lesson_number: number;
  thumbnail: string | null;
  runtime: number | null;
  has_file: number;
}

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
  if (!thumbnail) return null;
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

export function LessonPlaylist({ lessons, currentLessonId }: { lessons: PlaylistLesson[]; currentLessonId: number }) {
  return (
    <div className="flex flex-col h-full bg-zinc-950/50 overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-sm font-black uppercase tracking-widest text-white/50">Playlist</h3>
        <p className="text-xs text-muted-foreground mt-1">{lessons.length} lessons in module</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {lessons.map((les) => {
          const isActive = les.id === currentLessonId;
          const hasFile = les.has_file === 1;
          return (
            <Link
              key={les.id}
              href={hasFile ? `/learn/${les.id}` : '#'}
              className={`group flex items-center gap-3 p-2 rounded-lg transition-all ${
                isActive ? 'bg-primary/20 border border-primary/30' : hasFile ? 'hover:bg-white/5' : 'opacity-40 pointer-events-none'
              }`}
            >
              <div className="relative w-24 aspect-video rounded bg-zinc-900 overflow-hidden shrink-0">
                {les.thumbnail && getPosterUrl(les.thumbnail) ? (
                  <Image src={getPosterUrl(les.thumbnail)!} alt="" fill className="object-contain" unoptimized />
                ) : null}
                {isActive ? (
                  <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                    <Play className="w-4 h-4 fill-white text-white" />
                  </div>
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-black text-muted-foreground">{les.lesson_number.toString().padStart(2, '0')}</span>
                <h4 className="text-xs font-bold truncate">{les.title || `Lesson ${les.lesson_number}`}</h4>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
