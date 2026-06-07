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
    ChevronDown,
    Tag,
    Filter,
    ShieldAlert
} from 'lucide-react';
import { useAdmin } from '@/contexts/admin-context';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Dropdown } from '@/components/ui/dropdown';

interface PublicMoviesListProps {
  initialMovies: MovieWithFile[];
}

const ITEMS_PER_LOAD = 24;

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 
  'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 
  'TV Movie', 'Thriller', 'War', 'Western'
];

const SORT_OPTIONS = [
    { value: 'title_asc', label: 'Title A-Z' },
    { value: 'title_desc', label: 'Title Z-A' },
    { value: 'newest', label: 'Latest Added' },
    { value: 'rating', label: 'Top Rated' }
];

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = "/api/images?path=" + b64urlEncode(basePath);
  if (query) url += "&" + query;
  return url;
};

export function PublicMoviesList({ initialMovies }: PublicMoviesListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin } = useAdmin();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get('genre') || '');
  const [selectedAudience, setSelectedAudience] = useState<'family' | 'adult' | ''>(
    (searchParams.get('audience') as any) || ''
  );
  const [sort, setSort] = useState<'title_asc' | 'title_desc' | 'rating' | 'newest'>('title_asc');
  const [showFilters, setShowFilters] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Track scroll for depth only
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Initialize filters toggle from storage
  useEffect(() => {
    const saved = localStorage.getItem('mm_show_filters');
    if (saved !== null) setShowFilters(saved === 'true');
  }, []);

  const toggleFilters = () => {
    const newState = !showFilters;
    setShowFilters(newState);
    localStorage.setItem('mm_show_filters', String(newState));
  };

  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (debouncedSearch) count++;
    if (selectedQuality) count++;
    if (selectedYear) count++;
    if (selectedGenre) count++;
    if (selectedAudience) count++;
    if (sort !== 'title_asc') count++;
    return count;
  }, [debouncedSearch, selectedQuality, selectedYear, selectedGenre, selectedAudience, sort]);

  useEffect(() => {
    const audience = searchParams.get('audience') as 'family' | 'adult' | '';
    if (audience !== selectedAudience) {
      setSelectedAudience(audience || '');
    }
    const genre = searchParams.get('genre') || '';
    if (genre !== selectedGenre) {
      setSelectedGenre(genre);
    }
  }, [searchParams, selectedAudience, selectedGenre]);

  const handleAudienceChange = (id: string) => {
    setSelectedAudience(id as any);
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('audience', id);
    } else {
      params.delete('audience');
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleGenreChange = (genre: string) => {
    setSelectedGenre(genre);
    const params = new URLSearchParams(searchParams.toString());
    if (genre) {
      params.set('genre', genre);
    } else {
      params.delete('genre');
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  
  const [movies, setMovies] = useState<MovieWithFile[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= ITEMS_PER_LOAD);
  const [totalCount, setTotalCount] = useState(0);
  
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialMovies.length);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const qualities = ['720p', '1080p'];
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const list = [];
    for (let i = currentYear; i >= startYear; i--) list.push(i.toString());
    return list;
  }, []);

  const fetchMovies = useCallback(async (search = '', quality = '', year = '', audience = '', sortOrder: 'title_asc' | 'title_desc' | 'rating' | 'newest' = 'title_asc', genre = '', reset = false) => {
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
      if (genre) url += "&genre=" + encodeURIComponent(genre);
      url += "&sort=" + sortOrder;
      
      const res = await fetch(url, { cache: 'no-store' });
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

  const [restored, setRestored] = useState({ done: false, didRestore: false });

  useEffect(() => {
    let didRestore = false;
    const saved = sessionStorage.getItem('mm_movies_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSearchTerm(state.searchTerm || '');
        setDebouncedSearch(state.searchTerm || '');
        setSelectedQuality(state.selectedQuality || '');
        setSelectedYear(state.selectedYear || '');
        setSort(state.sort || 'title_asc');
        
        setMovies(state.movies || initialMovies);
        offsetRef.current = state.offset || initialMovies.length;
        setHasMore(state.hasMore ?? (initialMovies.length >= ITEMS_PER_LOAD));
        setTotalCount(state.totalCount || 0);

        didRestore = true;

        setTimeout(() => {
          window.scrollTo({ top: state.scrollY || 0, behavior: 'instant' });
          sessionStorage.removeItem('mm_movies_state');
        }, 100);
      } catch (e) {}
    }
    
    setRestored({ done: true, didRestore });
  }, [initialMovies]);

  const isInitialMount = useRef(true);
  const lastStateString = useRef('');

  useEffect(() => {
    if (!restored.done) return;

    const currentStateString = JSON.stringify({
      debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre
    });

    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastStateString.current = currentStateString;
      
      if (!restored.didRestore) {
         fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre, true);
      }
      return;
    }

    if (currentStateString === lastStateString.current) return;

    lastStateString.current = currentStateString;
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre, true);
  }, [debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre, restored, fetchMovies]);

  const saveStateAndScroll = () => {
    const state = {
      movies,
      offset: offsetRef.current,
      hasMore,
      totalCount,
      scrollY: window.scrollY,
      searchTerm,
      selectedQuality,
      selectedYear,
      sort
    };
    sessionStorage.setItem('mm_movies_state', JSON.stringify(state));
  };

  // Infinite Scroll using Intersection Observer
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || loadingRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre);
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [hasMore, fetchMovies, debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedQuality('');
    setSelectedYear('');
    setSelectedGenre('');
    setSelectedAudience('');
    setSort('title_asc');
    router.push(pathname, { scroll: false });
  };

  const isFiltered = searchTerm || selectedQuality || selectedYear || selectedAudience || selectedGenre || sort !== 'title_asc';

  return (
    <div className="space-y-10 pb-24 pt-0">
      {/* Search & Filters Section - STABLE STICKY CONTAINER */}
      <div className={`sticky top-20 z-50 bg-background transition-all duration-300 overflow-visible py-6 ${
        isScrolled ? 'shadow-2xl border-b border-white/[0.04]' : 'border-b border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto w-full px-6 flex flex-col gap-6 overflow-visible relative">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Search Input Area */}
            <div className="relative flex-1 max-w-2xl group">
               <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 transition-colors group-focus-within:text-primary">
                  {loading ? <Loader2 className="h-full w-full animate-spin" /> : <Search className="h-full w-full" />}
               </div>
               <input
                  type="text"
                  placeholder="Search your movie collection..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-11 bg-transparent pl-8 pr-12 font-bold tracking-tight text-lg placeholder:text-muted-foreground/20 focus:outline-none border-b border-border/40 focus:border-primary transition-colors"
               />
               {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground/40 hover:text-foreground">
                      <X className="h-4 w-4" />
                  </button>
               )}
            </div>

            {/* Action Group */}
            <div className="shrink-0 flex items-center gap-2">
                <div className={`flex items-center bg-muted/20 border border-border/40 rounded-xl p-1 gap-1 transition-all duration-300 ${!showFilters ? 'shadow-lg shadow-primary/5 border-primary/20' : ''}`}>
                   <button
                        onClick={toggleFilters}
                        className={`flex items-center gap-2.5 px-4 h-9 rounded-lg transition-all ${
                            showFilters 
                            ? 'bg-white/[0.03] border border-white/[0.08] text-foreground/80 shadow-inner' 
                            : 'text-muted-foreground/60 hover:text-foreground/80'
                        }`}
                    >
                        <Filter className={`h-3.5 w-3.5 transition-transform duration-500 ${showFilters ? 'rotate-180' : 'text-primary'}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${!showFilters ? 'text-primary/70' : ''}`}>
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                        </span>
                        {activeFilterCount > 0 && !showFilters && (
                            <span className="flex items-center justify-center min-w-[16px] h-[16px] bg-primary text-primary-foreground text-[8px] rounded-full px-1 shadow-lg animate-pulse">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <div className="h-4 w-px bg-border/30 mx-0.5" />

                    <div className="px-4 h-9 flex items-center">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 whitespace-nowrap flex items-center gap-2.5">
                            <div className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" />
                            {totalCount} <span className="hidden sm:inline opacity-60">Movies found</span>
                            <span className="sm:hidden">Movies</span>
                        </span>
                    </div>
                </div>
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-visible"
              >
                <LayoutGroup>
                    <div className="overflow-visible pt-2">
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-6 lg:gap-5 pb-2">
                         {/* Sort Dropdown */}
                         <Dropdown 
                           label="Order"
                           value={sort}
                           onChange={(val) => setSort(val as any)}
                           options={SORT_OPTIONS}
                           className="w-44"
                         />

                         <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

                         {/* Sector Dropdown */}
                         <Dropdown 
                           label="Category"
                           placeholder="All Categories"
                           value={selectedAudience}
                           onChange={handleAudienceChange}
                           options={[
                             { value: 'family', label: 'Family' },
                             { value: 'adult', label: 'Adult' }
                           ]}
                           className="w-44"
                         />

                         <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

                         <Dropdown 
                           label="Genre"
                           placeholder="All Genres"
                           value={selectedGenre}
                           onChange={handleGenreChange}
                           options={GENRE_OPTIONS.map(g => ({ value: g, label: g }))}
                           className="w-40"
                         />

                         <Dropdown 
                           label="Format"
                           placeholder="All Qualities"
                           value={selectedQuality}
                           onChange={setSelectedQuality}
                           options={qualities.map(q => ({ value: q, label: q }))}
                           className="w-36"
                         />

                         <Dropdown 
                           label="Year"
                           placeholder="All Years"
                           value={selectedYear}
                           onChange={setSelectedYear}
                           options={years.slice(0, 50).map(y => ({ value: y, label: y }))}
                           className="w-40"
                         />

                         {activeFilterCount > 0 && (
                            <button
                                onClick={clearFilters}
                                className="h-11 px-6 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-destructive hover:text-white transition-all active:scale-95 shadow-lg shadow-destructive/5 mb-0.5 shrink-0"
                            >
                                <X className="h-3.5 w-3.5 mr-2 inline-block" />
                                Reset All Filters
                            </button>
                         )}
                      </div>
                    </div>
                </LayoutGroup>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Grid Display Section */}
      <div className="max-w-7xl mx-auto w-full px-6">
        {movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
            {movies.map((movie, idx) => (
              <motion.div 
                key={movie.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.3, 
                  delay: (idx % 12) * 0.03,
                  ease: 'easeOut' 
                }}
                whileHover={{ scale: 1.02 }}
                className="flex flex-col gap-4 group"
              >
                <Link 
                  href={"/watch/" + movie.id} 
                  onClick={saveStateAndScroll}
                  className={`block relative aspect-poster bg-muted rounded-xl overflow-hidden shadow-xl border-2 border-transparent transition-all duration-300 ${
                    selectedAudience === 'family' ? 'group-hover:shadow-green-500/10 group-hover:border-green-500/20' : 'group-hover:shadow-primary/10 group-hover:border-primary/20'
                  }`}
                >
                  <Image
                    src={getPosterUrl(movie.thumbnail)}
                    alt={movie.title}
                    fill
                    unoptimized
                    priority={idx < 6}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  
                  {/* Subtle Overlays - Hover only */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {movie.needs_repair === 1 && (
                    <div className="absolute inset-0 bg-destructive/10 backdrop-blur-[2px] flex items-center justify-center">
                       <div className="px-3 py-1.5 bg-destructive text-destructive-foreground text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-2xl shadow-destructive/50 flex items-center gap-2 animate-pulse scale-90 sm:scale-100">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Repair_Required
                       </div>
                    </div>
                  )}

                  {selectedAudience === 'family' && (
                    <div className="absolute top-2 left-2 p-1.5 bg-green-500 rounded-full shadow-lg shadow-green-500/50">
                      <Sparkles className="h-3 w-3 text-white fill-current" />
                    </div>
                  )}
                </Link>

                <div className="space-y-1.5 px-1.5 pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[13px] font-black text-foreground/90 truncate group-hover:text-primary transition-colors leading-none pt-0.5">
                      {movie.title}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] font-black text-amber-500 shrink-0">
                       <Star className="h-3 w-3 fill-current" />
                       {movie.rating ? movie.rating.toFixed(1) : '0.0'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-tight">
                       <span>{movie.year}</span>
                       <span className="opacity-30">•</span>
                       <span className="tracking-tighter">{movie.quality || 'HDR'}</span>
                       <span className="opacity-30">•</span>
                       <span className="text-[9px] font-black tracking-widest text-primary/40">CC</span>
                    </div>

                    {movie.audience === 'family' && (
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-green-500 uppercase tracking-[0.1em]">
                            <div className="w-1 h-1 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
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
               {selectedAudience === 'family' ? (
                 <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                 >
                    <Sparkles className="h-20 w-20 text-green-500/20 mx-auto" />
                 </motion.div>
               ) : (
                 <Search className="h-20 w-20 text-muted-foreground/10 mx-auto" />
               )}
               <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedAudience === 'family' ? 'Oh no! The magic is hidden!' : 'No movies found'}
              </h2>
              <p className="text-muted-foreground max-w-xs mx-auto text-sm leading-relaxed">
                {selectedAudience === 'family' 
                  ? "We couldn't find any magic movies with those search words. Try something else!"
                  : "We couldn't find any movies matching your current search parameters."}
              </p>
            </div>
            <button
              onClick={clearFilters}
              className={`px-8 py-3 text-xs font-black uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-xl ${
                selectedAudience === 'family' 
                ? 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-500' 
                : 'bg-primary text-primary-foreground shadow-primary/20'
              }`}
            >
              {selectedAudience === 'family' ? 'See All Magic Movies' : 'Reset All Filters'}
            </button>
          </div>
        )}
        
        {hasMore && (
          <div ref={loadMoreRef} className="mt-20 flex justify-center pb-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] animate-pulse">Syncing movies...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
