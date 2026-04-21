'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MovieWithFile } from '@/lib/types';
import { b64urlEncode } from '@/lib/b64url';
import {
    Search,
    Play,
    Edit,
    Loader2,
    Filter,
    X,
    ChevronDown,
    Monitor,
    ArrowDownAZ,
    ArrowUpAZ,
    Clock,
    Star,
    Info,
    Sparkles
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
  return "/api/images?path=" + b64urlEncode(thumbnail);
};

export default function PublicMoviesList({ initialMovies }: PublicMoviesListProps) {
  const { isAdmin } = useAdmin();
  const searchParams = useSearchParams();
  
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
            const existingIds = new Set(prev.map(m => m.id));
            const uniqueNewMovies = newMovies.filter(m => !existingIds.has(m.id));
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

  // Debounce search term only
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch movies when any filter (including debounced search) changes
  useEffect(() => {
    fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, true);
  }, [debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, fetchMovies]);

  const handleScroll = useCallback(() => {
    if (loadingRef.current || !hasMore) return;

    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;

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
    setSelectedAudience('');
    setSort('title_asc');
  };

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
                placeholder="Search by title, director, year, or plot..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 bg-transparent pl-8 pr-6 text-lg font-semibold placeholder:text-muted-foreground/30 focus:outline-none border-b border-border focus:border-primary transition-all"
             />
          </div>

          <div className="flex items-center gap-6 text-sm font-bold text-muted-foreground/40">
             <span>{totalCount} Total Entries</span>
             {(searchTerm || selectedQuality || selectedYear || selectedAudience) && (
               <button onClick={clearFilters} className="text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors">
                  <X className="h-4 w-4" /> Reset
               </button>
             )}
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-4">
           {/* Sort Toggle */}
           <button 
              onClick={() => setSort(sort === 'title_asc' ? 'title_desc' : 'title_asc')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs font-bold transition-all ${
                sort === 'title_asc' ? 'bg-primary border-primary text-primary-foreground' : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
           >
              {sort === 'title_asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
              {sort === 'title_asc' ? 'Title A-Z' : 'Title Z-A'}
           </button>

           <div className="h-6 w-px bg-border/50 mx-2 hidden sm:block" />

           {/* Audience Selection */}
           <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-black mr-2 opacity-30 text-foreground/50">Category:</span>
              <div className="flex gap-2">
                {[
                  { id: '', label: 'All', icon: null },
                  { id: 'family', label: 'Family', icon: <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" /> },
                  { id: 'adult', label: 'Adult', icon: <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" /> }
                ].map(cat => (
                  <button 
                    key={cat.id}
                    onClick={() => setSelectedAudience(cat.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedAudience === cat.id ? 'bg-primary border-primary text-primary-foreground' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>
           </div>

           <div className="h-6 w-px bg-border/50 mx-2 hidden md:block" />

           {/* Quality Pills */}
           <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-black mr-2 opacity-30">Quality:</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedQuality('')}
                  className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${!selectedQuality ? 'bg-white text-black' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                >
                  All
                </button>
                {qualities.map(q => (
                  <button 
                    key={q}
                    onClick={() => setSelectedQuality(q)}
                    className={`px-4 py-2 rounded-full border text-xs font-bold transition-all ${selectedQuality === q ? 'bg-white text-black' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
           </div>

           <div className="h-6 w-px bg-border/50 mx-2 hidden lg:block" />

           {/* Year Dropdown */}
           <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-black mr-2 opacity-30">Release:</span>
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-full px-5 py-2.5 text-xs font-bold outline-none cursor-pointer hover:border-white/20 transition-all appearance-none pr-10"
                >
                  <option value="" className="bg-background">All Years</option>
                  {years.slice(0, 30).map(y => <option key={y} value={y} className="bg-background">{y}</option>)}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-50" />
              </div>
           </div>
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
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  
                  {/* Audience Badge */}
                  <div className="absolute top-3 left-3 z-30 flex flex-col gap-2">
                    {movie.audience === 'family' && (
                      <span className="bg-green-600/90 backdrop-blur-md text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-xl">
                        <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        Family
                      </span>
                    )}
                    {movie.audience === 'adult' && (
                      <span className="bg-red-600/90 backdrop-blur-md text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 shadow-xl">
                        <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        Adult
                      </span>
                    )}
                    {(movie as any).has_subtitles === 1 && (
                      <span className="bg-primary/10 backdrop-blur-md text-primary text-[8px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-widest border border-primary/20 flex items-center gap-1 shadow-sm">
                        <Sparkles className="h-2 w-2 fill-current" />
                        CC
                      </span>
                    )}
                  </div>

                  {/* Subtle hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-500">
                      <Play className="h-6 w-6 text-white fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="absolute top-3 right-3 z-30">
                    <span className="bg-black/60 backdrop-blur-md text-[9px] font-black text-white px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                      {movie.quality || 'FHD'}
                    </span>
                  </div>
                </Link>

                <div className="space-y-1 px-0.5">
                   <h3 className="font-bold text-sm leading-snug text-foreground group-hover:text-primary transition-colors truncate">
                    {movie.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-muted-foreground/60">
                    <span>{movie.year || 'N/A'}</span>
                    <div className="h-1 w-1 rounded-full bg-border" />
                    <span className="flex items-center gap-1 font-bold text-primary/70">
                      <Star className="h-2.5 w-2.5 fill-current" /> {movie.rating || '0.0'}
                    </span>
                  </div>
                  
                  {isAdmin && (
                    <Link 
                      href={"/admin/movies/" + movie.id}
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-primary/40 hover:text-primary transition-all pt-2"
                    >
                      <Edit className="h-3 w-3" /> Edit Entry
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          !loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-48 text-center"
            >
              <div className="p-10 bg-white/5 rounded-full mb-8">
                <Info className="h-16 w-16 text-muted-foreground/20" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">No movies found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mb-10 leading-relaxed">
                We couldn't find any movies matching your current search parameters.
              </p>
              <button 
                onClick={clearFilters}
                className="px-10 py-3.5 bg-primary text-primary-foreground text-sm font-bold rounded-full hover:scale-105 active:scale-95 transition-all"
              >
                Clear all filters
              </button>
            </motion.div>
          )
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading amazing content...</span>
        </div>
      )}
    </div>
  );
}
