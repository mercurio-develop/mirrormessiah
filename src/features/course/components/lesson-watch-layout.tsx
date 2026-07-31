'use client';

import { useState } from 'react';
import { LayoutList } from 'lucide-react';
import { LessonPlaylist } from './lesson-playlist';

interface LessonWatchLayoutProps {
  children: React.ReactNode;
  playlist: Parameters<typeof LessonPlaylist>[0]['lessons'];
  currentLessonId: number;
}

export function LessonWatchLayout({ children, playlist, currentLessonId }: LessonWatchLayoutProps) {
  const [showPlaylist, setShowPlaylist] = useState(true);

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full bg-black">
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</div>
      {showPlaylist ? (
        <aside className="hidden lg:block w-96 shrink-0 border-l border-white/5">
          <LessonPlaylist lessons={playlist} currentLessonId={currentLessonId} />
        </aside>
      ) : null}
      <button
        onClick={() => setShowPlaylist(!showPlaylist)}
        className="hidden lg:flex absolute top-20 right-6 z-50 w-10 h-10 rounded-full bg-zinc-900 border border-white/20 items-center justify-center"
        type="button"
      >
        <LayoutList className="h-5 w-5" />
      </button>
    </div>
  );
}
