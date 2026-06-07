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

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
    if (!thumbnail) return null;
    if (thumbnail.startsWith('http')) return thumbnail;
    const [basePath, query] = thumbnail.split('?');
    let url = "/api/images?path=" + b64urlEncode(basePath);
    if (query) url += "&" + query;
    return url;
};

export function SeasonSelector({ seasons, seriesId }: { seasons: Season[], seriesId: number }) {
  const [activeSeasonId, setActiveSeasonId] = useState<number | null>(seasons.length > 0 ? seasons[0].id : null);

  const activeSeason = seasons.find(s => s.id === activeSeasonId);

  return (
    <div className="space-y-8 pb-20">
      {/* Season Tabs - Modern Underline Tabs */}
      <div className="flex items-center gap-6 overflow-x-auto pb-2 scrollbar-hide border-b border-border/20">
         {seasons.map(season => (
            <button
              key={season.id}
              onClick={() => setActiveSeasonId(season.id)}
              className={`shrink-0 text-lg md:text-xl font-bold tracking-tight pb-3 border-b-4 transition-all duration-300 ${
                 activeSeasonId === season.id 
                 ? 'border-white text-white' 
                 : 'border-transparent text-muted-foreground hover:text-white/80'
              }`}
            >
              {season.title || `Season ${season.season_number}`}
            </button>
         ))}
      </div>

      {/* Episodes List - Netflix Style Vertical List */}
      {activeSeason && (
         <div className="space-y-4">
            {activeSeason.episodes.length === 0 ? (
               <p className="text-muted-foreground italic">No episodes available for this season.</p>
            ) : (
               <div className="flex flex-col gap-2 border-t border-border/10 pt-2">
                  {activeSeason.episodes.map(ep => (
                     <Link
                       key={ep.id}
                       href={`/watch/episode/${ep.id}`}
                       className={`group relative flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 rounded-xl transition-all duration-300 ${
                          ep.has_file 
                          ? 'hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/10' 
                          : 'opacity-50 pointer-events-none'
                       }`}
                     >
                        <div className="flex items-center justify-between w-full sm:w-auto gap-4 sm:gap-6">
                            <span className="text-2xl sm:text-3xl font-black text-muted-foreground/40 w-8 sm:w-12 text-center shrink-0 group-hover:text-white transition-colors">
                               {ep.episode_number}
                            </span>
                            
                            {/* Thumbnail Placeholder 16:9 */}
                            <div className="relative w-32 sm:w-40 aspect-video bg-zinc-900 rounded-md overflow-hidden shrink-0 border border-white/5 shadow-md">
                                {ep.thumbnail ? (
                                    <Image src={getPosterUrl(ep.thumbnail)!} alt={ep.title || `Episode ${ep.episode_number}`} fill className="object-cover" unoptimized />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black flex items-center justify-center">
                                        {/* Minimalist placeholder for missing thumbnails */}
                                        <div className="w-12 h-1 bg-white/10 rounded-full" />
                                    </div>
                                )}
                                
                                {ep.has_file && (
                                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                                       <div className="w-10 h-10 rounded-full border-[3px] border-white flex items-center justify-center bg-black/40 shadow-lg scale-90 group-hover:scale-100 transition-transform">
                                           <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                                       </div>
                                   </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 space-y-2 min-w-0 py-1 w-full">
                            <div className="flex items-center justify-between gap-4">
                               <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight truncate group-hover:text-white transition-colors">
                                   {ep.title || `Episode ${ep.episode_number}`}
                               </h3>
                               {ep.runtime && (
                                   <span className="text-xs font-bold text-muted-foreground shrink-0">{ep.runtime}m</span>
                               )}
                            </div>
                            
                            {ep.plot ? (
                                <p className="text-sm text-muted-foreground line-clamp-2 md:line-clamp-3 leading-relaxed">
                                    {ep.plot}
                                </p>
                            ) : (
                                <div className="space-y-2 mt-3 w-3/4 opacity-20">
                                  <div className="h-1.5 bg-muted-foreground rounded-full w-full" />
                                  <div className="h-1.5 bg-muted-foreground rounded-full w-2/3" />
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
