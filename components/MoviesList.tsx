'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MovieWithFile } from '@/lib/db';
import { Search, Play, Edit, Loader2, Calendar, Hash, Activity } from 'lucide-react';

interface MoviesListProps {
  initialMovies: MovieWithFile[];
}

const ITEMS_PER_LOAD = 24;

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const cleanPath = thumbnail.replace(/\/+/g, '/');
  return "/api/images?path=" + encodeURIComponent(cleanPath) + "&public=true";
};

export default function MoviesList({ initialMovies }: MoviesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [movies, setMovies] = useState<MovieWithFile[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= ITEMS_PER_LOAD);

  const loadMoreMovies = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch("/api/movies?offset=" + movies.length + "&limit=" + ITEMS_PER_LOAD);
      if (res.ok) {
        const data = await res.json();
        if (data.movies.length < ITEMS_PER_LOAD) setHasMore(false);
        setMovies(prev => [...prev, ...data.movies]);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, movies.length]);

  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollTop + clientHeight >= scrollHeight - 800) loadMoreMovies();
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreMovies]);

  const filteredMovies = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return movies.filter(m => 
      m.title.toLowerCase().includes(term) || 
      m.year?.toString().includes(term)
    );
  }, [movies, searchTerm]);

  return (
    <div className="space-y-12">
      <div className="relative group max-w-xl">
        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-primary/40">
          <Search className="h-4 w-4" />
        </div>
        <input
          type="text"
          placeholder="SEARCH_REGISTRY_ENTITIES..."
          className="w-full h-14 bg-card border border-border pl-14 pr-6 text-[11px] font-black uppercase tracking-widest focus:border-primary transition-all text-foreground placeholder:text-muted-foreground/30 rounded-md"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
        {filteredMovies.map((movie) => (
          <div key={movie.id} className="bg-background p-6 flex gap-6 group hover:bg-accent transition-all">
            <div className="w-24 shrink-0 relative aspect-poster border border-border bg-muted overflow-hidden rounded-sm">
               <Image
                  src={getPosterUrl(movie.thumbnail)}
                  alt={movie.title}
                  fill
                  className="object-cover transition-all duration-700 group-hover:scale-105"
                  sizes="100px"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
            </div>
            
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-black text-primary/40 uppercase tracking-tight">
                   <span>ID: 0x{movie.id.toString(16).toUpperCase()}</span>
                   <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> ONLINE</span>
                </div>
                <h3 className="text-base font-black text-foreground uppercase italic truncate">
                  {movie.title}
                </h3>
                <div className="flex gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {movie.year || '3000'}</span>
                  <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {movie.quality || 'FHD'}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Link
                  href={"/watch/" + movie.id}
                  className="px-4 py-2 bg-muted border border-border text-[10px] font-black uppercase text-foreground hover:bg-accent hover:border-primary/50 transition-all flex items-center gap-2 rounded-sm"
                >
                  <Play className="h-3 w-3" /> Preview
                </Link>
                <Link
                  href={"/admin/movies/" + movie.id}
                  className="px-4 py-2 bg-primary/10 border border-primary/20 text-[10px] font-black uppercase text-primary hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-2 rounded-sm"
                >
                  <Edit className="h-3 w-3" /> Edit_Node
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      )}
    </div>
  );
}
