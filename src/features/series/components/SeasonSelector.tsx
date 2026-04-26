'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';
import Image from 'next/image';

interface Episode {
  id: number;
  season_id: number;
  episode_number: number;
  title: string;
  plot: string | null;
  runtime: number | null;
  thumbnail: string | null;
  has_file: number;
}

interface Season {
  id: number;
  season_number: number;
  title: string | null;
  plot: string | null;
  poster: string | null;
  episodes: Episode[];
}

export default function SeasonSelector({ seasons, seriesId }: { seasons: Season[], seriesId: number }) {
  const [activeSeasonId, setActiveSeasonId] = useState<number | null>(seasons.length > 0 ? seasons[0].id : null);

  const activeSeason = seasons.find(s => s.id === activeSeasonId);

  return (
    <div className="space-y-8">
      {/* Season Tabs */}
      <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide border-b border-border/40">
         {seasons.map(season => (
            <button
              key={season.id}
              onClick={() => setActiveSeasonId(season.id)}
              className={`shrink-0 text-xl md:text-2xl font-black tracking-tight pb-4 border-b-4 transition-all duration-300 ${
                 activeSeasonId === season.id 
                 ? 'border-primary text-foreground' 
                 : 'border-transparent text-muted-foreground/40 hover:text-muted-foreground'
              }`}
            >
              Season {season.season_number}
            </button>
         ))}
      </div>

      {/* Episodes List */}
      {activeSeason && (
         <div className="space-y-4">
            {activeSeason.episodes.length === 0 ? (
               <p className="text-muted-foreground italic">No episodes available for this season.</p>
            ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeSeason.episodes.map(ep => (
                     <Link
                       key={ep.id}
                       href={`/watch/episode/${ep.id}`}
                       className={`group relative flex flex-col gap-3 p-4 rounded-2xl border bg-card/50 transition-all ${
                          ep.has_file ? 'hover:bg-card hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 cursor-pointer' : 'opacity-50 pointer-events-none'
                       }`}
                     >
                        <div className="flex items-start justify-between gap-4">
                           <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/50 font-black text-xl text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                              {ep.episode_number}
                           </div>
                           <div className="flex-1 space-y-1">
                              <h3 className="font-bold leading-tight line-clamp-2">{ep.title || `Episode ${ep.episode_number}`}</h3>
                              <p className="text-xs text-muted-foreground line-clamp-3">{ep.plot || 'No synopsis available.'}</p>
                           </div>
                           
                           {ep.has_file ? (
                              <div className="shrink-0 w-10 h-10 rounded-full border-2 border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                 <Play className="w-4 h-4 fill-current ml-0.5" />
                              </div>
                           ) : (
                              <div className="shrink-0 px-2 py-1 bg-destructive/10 text-destructive text-[9px] font-black uppercase tracking-widest rounded-md">
                                 Missing
                              </div>
                           )}
                        </div>
                     </Link>
                  ))}
               </div>
            )}
         </div>
      )}
    </div>
  );
}
