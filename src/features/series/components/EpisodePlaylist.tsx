'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';

interface PlaylistEpisode {
  id: number;
  title: string | null;
  episode_number: number;
  thumbnail: string | null;
  runtime: number | null;
  has_file: number;
}

interface EpisodePlaylistProps {
  episodes: PlaylistEpisode[];
  currentEpisodeId: number;
}

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
    if (!thumbnail) return null;
    if (thumbnail.startsWith('http')) return thumbnail;
    const [basePath, query] = thumbnail.split('?');
    let url = "/api/images?path=" + b64urlEncode(basePath);
    if (query) url += "&" + query;
    return url;
};

export default function EpisodePlaylist({ episodes, currentEpisodeId }: EpisodePlaylistProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950/50 border-l border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 bg-zinc-900/30">
        <h3 className="text-sm font-black uppercase tracking-widest text-white/50">Playlist</h3>
        <p className="text-xs text-muted-foreground font-medium mt-1">{episodes.length} Episodes in Season</p>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {episodes.map((ep) => {
          const isActive = ep.id === currentEpisodeId;
          const hasFile = ep.has_file === 1;

          return (
            <Link
              key={ep.id}
              href={hasFile ? `/watch/episode/${ep.id}` : '#'}
              className={`group flex items-center gap-3 p-2 rounded-lg transition-all ${
                isActive 
                ? 'bg-primary/20 border border-primary/30' 
                : hasFile 
                  ? 'hover:bg-white/5 border border-transparent' 
                  : 'opacity-40 cursor-not-allowed border border-transparent'
              }`}
            >
              {/* Thumbnail */}
              <div className="relative w-24 aspect-video rounded bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                {ep.thumbnail ? (
                  <Image 
                    src={getPosterUrl(ep.thumbnail)!} 
                    alt={ep.title || `Episode ${ep.episode_number}`} 
                    fill 
                    className="object-cover" 
                    unoptimized 
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                    <span className="text-[10px] font-black text-white/10 uppercase tracking-tighter">No Preview</span>
                  </div>
                )}
                
                {isActive && (
                  <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg animate-pulse">
                      <Play className="w-3 h-3 fill-primary text-primary ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {ep.episode_number.toString().padStart(2, '0')}
                  </span>
                  <h4 className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                    {ep.title || `Episode ${ep.episode_number}`}
                  </h4>
                </div>
                {ep.runtime && (
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{ep.runtime} min</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
