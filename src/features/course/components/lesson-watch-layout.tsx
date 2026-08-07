'use client';

import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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

      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-white/5 bg-zinc-950/50 overflow-hidden transition-[width] duration-300 ease-in-out ${
          showPlaylist ? 'w-96' : 'w-14'
        }`}
      >
        {showPlaylist ? (
          <>
            <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/50 truncate">Playlist</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">{playlist.length} lessons in module</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaylist(false)}
                title="Hide lesson list"
                aria-label="Hide lesson list"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <LessonPlaylist lessons={playlist} currentLessonId={currentLessonId} showHeader={false} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowPlaylist(true)}
            title="Show lesson list"
            aria-label="Show lesson list"
            className="p-3 border-b border-white/5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4 mx-auto" />
          </button>
        )}
      </aside>
    </div>
  );
}
