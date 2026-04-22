'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { MovieWithFile } from '@/lib/types';
import { b64urlEncode } from '@/lib/b64url';
import { 
    Search, 
    Loader2, 
    X, 
    ArrowDownAZ, 
    ArrowUpAZ, 
    Star, 
    Clock, 
    Play, 
    Info,
    Sparkles,
    AlertCircle,
    ChevronDown
} from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { motion, AnimatePresence } from 'framer-motion';

interface PublicMoviesListProps {
  initialMovies: MovieWithFile[];
}

const ITEMS_PER_LOAD = 24;

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = "/api/images?path=" + b64urlEncode(basePath);
  if (query) url += "&" + query;
  return url;
};

export default function PublicMoviesList({ initialMovies }: PublicMoviesListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin } = useAdmin();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedAudience, setSelectedAudience] = useState<'family' | 'adult' | ''>(
    (searchParams.get('audience') as any) || ''
  );
  const [sort, setSort] = useState<'title_asc' | 'title_desc'>('title_asc');

  useEffect(() => {
    const audience = searchParams.get('audience') as 'family' | 'adult' | '';
    if (audience !== selectedAudience) {
      setSelectedAudience(audience || '');
    }
  }, [searchParams, selectedAudience]);

  const handleAudienceChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('audience', id);
    } else {
      params.delete('audience');
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  
  const [movies, setMovies] = useState<MovieWithFile[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= ITEMS_PER_LOAD);
  const [totalCount, setTotalCount] = useState(0);
  
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialMovies.length);

  const qualities = ['720p', '1080p'];
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const list = [];
    for (let i = currentYear; i >= startYear; i--) list.push(i.toString());
    return list;
  }, []);

  const fetchMovies = useCallback(async (search = '', quality = '', year = '', audience = '', sortOrder: 'title_asc' | 'title_desc' = 'title_asc', reset = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      let url = "/api/movies?offset=" + currentOffset + "&limit=" + ITEMS_PER_LOAD;

      if (search) url += "&q=" + encodeURIComponent(search);
      if (quality) url += "&quality=" + encodeURIComponent(quality);
      if (year) url += "&year=" + encodeURIComponent(year);
      if (audience) url += "&audience=" + encodeURIComponent(audience);
      url += "&sort=" + sortOrder;
      
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
      console.error('Movies_Fetch_Failure:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, true);
  }, [debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, fetchMovies]);

  const handleScroll = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    const { scrollHeight, scrollTop, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 800) {
      fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort);
    }
  }, [fetchMovies, hasMore, debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedQuality('');
    setSelectedYear('');
    handleAudienceChange('');
    setSort('title_asc');
  };

  const isFiltered = searchTerm || selectedQuality || selectedYear || (selectedAudience && !searchParams.get('audience'));

  return (
    <div className="space-y-12 pb-24 pt-10">
      {/* Search & Filters Section */}
      <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1 max-w-2xl group">
             <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary">
                {loading ? <Loader2 className="h-full w-full animate-spin" /> : <Search className="h-full w-full" />}
             </div>
             <input
                type="text"
                placeholder="Search by title, director, year..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 bg-transparent pl-8 pr-40 text-lg font-semibold placeholder:text-muted-foreground/30 focus:outline-none border-b border-border focus:border-primary transition-all"
             />
             <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3 pr-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 bg-muted/20 px-3 py-1.5 rounded-lg border border-border/50">
                    {totalCount} Entries
                </span>
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground/40 hover:text-foreground">
                        <X className="h-4 w-4" />
                    </button>
                )}
             </div>
          </div>
        </div>

        {/* Filter Row - Horizontally scrollable on mobile */}
        <div className="flex flex-nowrap lg:flex-wrap items-end gap-6 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:px-0 scrollbar-hide">
           {/* Sort Toggle */}
           <div className="flex flex-col gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-[0.2em] font-black text-foreground/50 ml-1">Sort Order</span>
              <button 
                  onClick={() => setSort(sort === 'title_asc' ? 'title_desc' : 'title_asc')}
                  className={`flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-extrabold transition-all shadow-md active:scale-95 ${
                    sort === 'title_asc' 
                      ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_20px_rgba(56,189,248,0.3)] ring-2 ring-primary/20' 
                      : 'bg-card border-border hover:border-primary/40 text-foreground hover:bg-muted/50'
                  }`}
              >
                  {sort === 'title_asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
                  {sort === 'title_asc' ? 'Title A-Z' : 'Title Z-A'}
              </button>
           </div>

           <div className="h-12 w-px bg-border/40 mx-2 hidden lg:block mb-1 shrink-0" />

           {/* Audience Selection */}
           <div className="flex flex-col gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-[0.2em] font-black text-foreground/50 ml-1">Classification</span>
              <div className="flex gap-2.5">
                {[
                  { id: '', label: 'All', icon: null },
                  { id: 'family', label: 'Family', icon: <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" /> },
                  { id: 'adult', label: 'Adult', icon: <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" /> }
                ].map(cat => (
                  <button 
                    key={cat.id}
                    onClick={() => handleAudienceChange(cat.id)}
                    className={`flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-extrabold transition-all shadow-md active:scale-95 ${
                      selectedAudience === cat.id 
                        ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_20px_rgba(56,189,248,0.3)] ring-2 ring-primary/20' 
                        : 'bg-card border-border hover:border-primary/40 text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>
           </div>

           <div className="h-12 w-px bg-border/40 mx-2 hidden lg:block mb-1 shrink-0" />

           {/* Quality Pills */}
           <div className="flex flex-col gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-[0.2em] font-black text-foreground/50 ml-1">Resolution</span>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setSelectedQuality('')}
                  className={`px-6 py-3 rounded-xl border text-sm font-extrabold transition-all shadow-md active:scale-95 ${
                    !selectedQuality 
                      ? 'bg-foreground text-background border-foreground shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-2 ring-foreground/20' 
                      : 'bg-card border-border hover:border-primary/40 text-foreground hover:bg-muted/50'
                  }`}
                >
                  All
                </button>
                {qualities.map(q => (
                  <button 
                    key={q}
                    onClick={() => setSelectedQuality(q)}
                    className={`px-6 py-3 rounded-xl border text-sm font-extrabold transition-all shadow-md active:scale-95 ${
                      selectedQuality === q 
                        ? 'bg-foreground text-background border-foreground shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-2 ring-foreground/20' 
                        : 'bg-card border-border hover:border-primary/40 text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
           </div>

           <div className="h-12 w-px bg-border/40 mx-2 hidden lg:block mb-1 shrink-0" />

           {/* Year Dropdown */}
           <div className="flex flex-col gap-2 shrink-0 pr-4 lg:pr-0">
              <span className="text-[11px] uppercase tracking-[0.2em] font-black text-foreground/50 ml-1">Release Year</span>
              <div className="relative group/select">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-card border border-border rounded-xl px-6 py-3 text-sm font-extrabold outline-none cursor-pointer hover:border-primary/40 transition-all appearance-none pr-12 shadow-md group-hover/select:bg-muted/50"
                >
                  <option value="" className="bg-background">All Eras</option>
                  {years.slice(0, 50).map(y => <option key={y} value={y} className="bg-background">{y}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground transition-transform group-hover/select:translate-y-[-40%]" />
              </div>
           </div>

           {isFiltered && (
             <div className="flex flex-col gap-2 shrink-0 pb-[1px] pr-6 lg:pr-0">
                <span className="text-[11px] uppercase tracking-[0.2em] font-black text-transparent ml-1">.</span>
                <button 
                    onClick={clearFilters} 
                    className="h-[46px] px-6 bg-destructive/10 border border-destructive/20 hover:bg-destructive hover:text-destructive-foreground text-destructive text-sm font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 group/reset shadow-lg shadow-destructive/5 active:scale-95"
                >
                    <X className="h-4 w-4 group-hover/reset:rotate-90 transition-transform duration-300" /> 
                    Reset
                </button>
             </div>
           )}
        </div>
      </div>

      {/* Grid Display Section */}
      <div className="max-w-7xl mx-auto w-full px-6">
        {movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
            {movies.map((movie, idx) => (
              <motion.div 
                key={movie.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: (idx % 12) * 0.05 }}
                className="flex flex-col gap-4 group"
              >
                <Link href={"/watch/" + movie.id} className="block relative aspect-poster bg-muted rounded-lg overflow-hidden content-scale shadow-xl group-hover:shadow-primary/10">
                  <Image
                    src={getPosterUrl(movie.thumbnail)}
                    alt={movie.title}
                    fill
                    unoptimized
                    priority={idx < 6}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  
                  {/* Subtle Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* Rating Badge */}
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded border border-white/10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-[-10px] group-hover:translate-y-0">
                    <Star className="h-2.5 w-2.5 text-primary fill-primary" />
                    <span className="text-[10px] font-bold text-white">{movie.rating || '0.0'}</span>
                  </div>

                  {/* Quality Badge */}
                  <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-primary/20 backdrop-blur-md rounded border border-primary/30 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[10px] group-hover:translate-y-0">
                    <span className="text-[8px] font-black text-primary uppercase tracking-tighter">{movie.quality || 'HDR'}</span>
                  </div>
                </Link>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                    {movie.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground/60">{movie.year}</span>
                    {movie.audience === 'family' && (
                        <div className="flex items-center gap-1 text-[9px] font-black text-green-500 uppercase tracking-tighter">
                            <Sparkles className="h-2.5 w-2.5" />
                            Family
                        </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center space-y-6 animate-in fade-in zoom-in duration-700">
            <div className="relative inline-block">
               <Search className="h-20 w-20 text-muted-foreground/10 mx-auto" />
               <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">No entities found</h2>
              <p className="text-muted-foreground max-w-xs mx-auto text-sm leading-relaxed">
                We couldn't find any movies matching your current search parameters.
              </p>
            </div>
            <button
              onClick={clearFilters}
              className="px-8 py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
            >
              Reset All Filters
            </button>
          </div>
        )}
        
        {hasMore && (
          <div className="mt-20 flex justify-center pb-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] animate-pulse">Synchronizing Archives...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
