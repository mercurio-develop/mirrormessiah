'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MovieWithFile } from '@/lib/types';
import { b64urlEncode } from '@/lib/b64url';
import { Search, Play, Edit, Loader2, Calendar, Hash, Activity, Film, X, AlertCircle } from 'lucide-react';

interface MoviesListProps {
  initialMovies: MovieWithFile[];
}

const ITEMS_PER_LOAD = 50;

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  
  // Handle paths that might have a cache-buster query param already
  const [basePath, query] = thumbnail.split('?');
  let url = "/api/images?path=" + b64urlEncode(basePath);
  if (query) url += "&" + query;
  
  return url;
};

export default function MoviesList({ initialMovies }: MoviesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [movies, setMovies] = useState<MovieWithFile[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= 24);
  const [totalCount, setTotalCount] = useState(initialMovies.length);

  const loadingRef = useRef(false);
  const offsetRef = useRef(initialMovies.length);

  const fetchMovies = useCallback(async (search = '', reset = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      let url = `/api/movies?offset=${currentOffset}&limit=${ITEMS_PER_LOAD}`;
      if (search) url += "&q=" + encodeURIComponent(search);
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const newMovies = data.movies || [];
        setTotalCount(data.total || 0);
        
        if (reset) {
          setMovies(newMovies);
          offsetRef.current = newMovies.length;
        } else {
          setMovies(prev => {
            const existingIds = new Set(prev.map((m: MovieWithFile) => m.id));
            const uniqueNewMovies = newMovies.filter((m: MovieWithFile) => !existingIds.has(m.id));
            return [...prev, ...uniqueNewMovies];
          });
          offsetRef.current += newMovies.length;
        }
        
        setHasMore(newMovies.length >= ITEMS_PER_LOAD);
      }
    } catch (err) {
      console.error('Registry_Fetch_Failure:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Trigger fetch on search change
  useEffect(() => {
    fetchMovies(debouncedSearch, true);
  }, [debouncedSearch, fetchMovies]);

  // Infinite Scroll
  useEffect(() => {
    const handleScroll = () => {
      if (loadingRef.current || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollTop + clientHeight >= scrollHeight - 800) {
        fetchMovies(debouncedSearch);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchMovies, hasMore, debouncedSearch]);

  const clearSearch = () => setSearchTerm('');

  return (
    <div className="space-y-8 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="relative group max-w-xl flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </div>
            <input
            type="text"
            placeholder="Search registry by title, director, year..."
            className="w-full h-12 bg-muted/50 border border-border pl-12 pr-12 text-sm font-medium focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all outline-none rounded-xl"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
                <button 
                    onClick={clearSearch}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-2">
            Displaying {movies.length} of {totalCount} Entities
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {movies.map((movie) => (
          <div key={movie.id} className="bg-muted/20 border border-border/50 p-4 flex gap-5 group hover:bg-muted/40 hover:border-border transition-all duration-300 rounded-2xl">
            <div className="w-20 shrink-0 relative aspect-poster bg-muted rounded-lg overflow-hidden shadow-md">
               <Image
                  src={getPosterUrl(movie.thumbnail)}
                  alt={movie.title}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                  sizes="80px"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
            </div>
            
            <div className="flex-1 flex flex-col justify-between min-w-0 py-1">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                   <span className="font-mono">ID: {movie.id}</span>
                   {movie.needs_repair ? (
                     <span className="flex items-center gap-1 text-destructive animate-pulse"><AlertCircle className="h-2.5 w-2.5" /> Repair_Required</span>
                   ) : (
                     <span className="flex items-center gap-1 text-primary/60"><Activity className="h-2.5 w-2.5" /> Registry Linked</span>
                   )}
                </div>
                <h3 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {movie.title}
                </h3>
                <div className="flex gap-4 text-[11px] font-semibold text-muted-foreground/60">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {movie.year || 'N/A'}</span>
                  <span className="flex items-center gap-1 font-mono uppercase tracking-tighter"><Hash className="h-3 w-3" /> {movie.quality || 'HDR'}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <Link
                  href={"/watch/" + movie.id}
                  className="flex-1 px-3 py-1.5 bg-muted border border-border hover:border-white/20 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-white/5 transition-all flex items-center justify-center gap-2 rounded-lg"
                >
                  <Play className="h-2.5 w-2.5 fill-current" /> Play
                </Link>
                <Link
                  href={"/admin/movies/" + movie.id}
                  className="flex-1 px-3 py-1.5 bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2 rounded-lg"
                >
                  <Edit className="h-2.5 w-2.5" /> Edit
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
