'use client';

import { useState } from 'react';
import { LayoutList, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EpisodePlaylist from './EpisodePlaylist';

interface PlaylistEpisode {
  id: number;
  title: string | null;
  episode_number: number;
  thumbnail: string | null;
  runtime: number | null;
  has_file: number;
}

interface EpisodeWatchLayoutProps {
  children: React.ReactNode;
  playlist: PlaylistEpisode[];
  currentEpisodeId: number;
}

export default function EpisodeWatchLayout({ 
  children, 
  playlist, 
  currentEpisodeId 
}: EpisodeWatchLayoutProps) {
  const [showPlaylist, setShowPlaylist] = useState(true);

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full relative bg-black">
      {/* Toggle Button - Floating High-Contrast */}
      <button 
        onClick={() => setShowPlaylist(!showPlaylist)}
        className={`hidden lg:flex absolute top-6 right-6 z-50 items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-white/20 text-white hover:bg-primary hover:border-primary hover:scale-110 transition-all shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-3xl group/toggle ${!showPlaylist ? 'opacity-100 ring-2 ring-primary/50' : 'opacity-40 hover:opacity-100'}`}
        title={showPlaylist ? "Hide Playlist" : "Show Playlist"}
      >
        {showPlaylist ? (
            <LayoutList className="h-6 w-6 text-white group-hover:text-primary transition-colors" />
        ) : (
            <div className="relative flex items-center justify-center">
                <LayoutList className="h-6 w-6 text-primary" />
                <ChevronLeft className="h-3 w-3 absolute -left-1 animate-pulse" />
            </div>
        )}
        
        <span className={`absolute right-full mr-4 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 pointer-events-none shadow-2xl ${showPlaylist ? 'opacity-0 -translate-x-2' : 'opacity-0 group-hover/toggle:opacity-100 translate-x-0'}`}>
          Expand Player
        </span>
      </button>

      {/* Main Content: Player & Info */}
      <motion.div 
        layout
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar"
      >
        {children}
      </motion.div>

      {/* Right Side: Playlist Sidebar */}
      <AnimatePresence initial={false}>
        {showPlaylist && (
          <motion.aside 
            initial={{ width: 0, opacity: 0, x: 100 }}
            animate={{ width: 384, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: 100 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="hidden lg:block shrink-0 border-l border-white/5 bg-zinc-950/40 overflow-hidden relative"
          >
             <div className="w-[384px] h-full overflow-hidden">
                <EpisodePlaylist episodes={playlist} currentEpisodeId={currentEpisodeId} />
             </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Playlist (Different treatment for touch) */}
      {!showPlaylist && (
         <div className="lg:hidden fixed bottom-6 right-6 z-50">
            <button 
                onClick={() => setShowPlaylist(true)}
                className="w-14 h-14 rounded-full bg-primary text-white shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
            >
                <LayoutList className="h-6 w-6" />
            </button>
         </div>
      )}
      
      {/* Mobile Toggle Indicator (bottom bar) */}
      <div className="lg:hidden flex justify-center p-4 bg-zinc-950/40 border-t border-white/5 shrink-0">
          <button 
            onClick={() => setShowPlaylist(!showPlaylist)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${showPlaylist ? 'bg-white/5 text-white/60' : 'bg-primary text-white shadow-lg'}`}
          >
            <LayoutList className="h-4 w-4" />
            {showPlaylist ? "Hide Playlist" : "Show Playlist"}
          </button>
      </div>
    </div>
  );
}
