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
import { useAdmin } from '@/contexts/AdminContext';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Dropdown from '@/components/ui/Dropdown';

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
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get('genre') || '');
  const [selectedAudience, setSelectedAudience] = useState<'family' | 'adult' | ''>(
    (searchParams.get('audience') as any) || ''
  );
  const [sort, setSort] = useState<'title_asc' | 'title_desc'>('title_asc');
  const [showFilters, setShowFilters] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  // Minimal scroll track for depth only
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedQuality) count++;
    if (selectedYear) count++;
    if (selectedGenre) count++;
    if (selectedAudience) count++;
    if (sort !== 'title_asc') count++;
    return count;
  }, [selectedQuality, selectedYear, selectedGenre, selectedAudience, sort]);

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
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('audience', id);
    } else {
      params.delete('audience');
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleGenreChange = (genre: string) => {
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

  const qualities = ['720p', '1080p'];
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const list = [];
    for (let i = currentYear; i >= startYear; i--) list.push(i.toString());
    return list;
  }, []);

  const fetchMovies = useCallback(async (search = '', quality = '', year = '', audience = '', sortOrder: 'title_asc' | 'title_desc' = 'title_asc', genre = '', reset = false) => {
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
    // Scroll to top on filter change for immediate feedback
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre, true);
  }, [debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre, fetchMovies]);

  const handleScroll = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    const { scrollHeight, scrollTop, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 800) {
      fetchMovies(debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre);
    }
  }, [fetchMovies, hasMore, debouncedSearch, selectedQuality, selectedYear, selectedAudience, sort, selectedGenre]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedQuality('');
    setSelectedYear('');
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
                  placeholder="Search by title, director, or year..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-11 bg-transparent pl-8 pr-12 font-bold tracking-tight text-lg placeholder:text-muted-foreground/20 focus:outline-none border-b border-border focus:border-primary transition-colors"
               />
               {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground/40 hover:text-foreground">
                      <X className="h-4 w-4" />
                  </button>
               )}
            </div>

            {/* Action Group */}
            <div className="shrink-0 flex items-center gap-2">
                {isFiltered && (
                   <button 
                     onClick={clearFilters} 
                     className="flex items-center gap-1.5 px-4 h-10 bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-destructive hover:text-white transition-all active:scale-95 shadow-lg shadow-destructive/5"
                   >
                      <X className="h-3 w-3" /> Clear Filters
                   </button>
                )}
                
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
                      <div className="flex flex-nowrap lg:flex-wrap items-end gap-5 overflow-x-auto lg:overflow-visible pb-2 -mx-6 px-6 lg:mx-0 lg:px-0 scrollbar-hide">
                         {/* Sort Toggle */}
                         <div className="flex flex-col gap-2 shrink-0">
                            <span className="text-[10px] uppercase tracking-[0.25em] font-black text-foreground/40 ml-1 leading-none">Order</span>
                            <button 
                                onClick={() => setSort(sort === 'title_asc' ? 'title_desc' : 'title_asc')}
                                className={`flex items-center gap-2 px-4 h-11 rounded-xl border text-[12px] font-bold transition-all shadow-md active:scale-95 ${
                                  sort === 'title_asc' 
                                    ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/10' 
                                    : 'bg-muted/20 border-border/50 hover:border-primary/30 text-foreground/80 hover:bg-muted/40'
                                }`}
                            >
                                {sort === 'title_asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
                                {sort === 'title_asc' ? 'A-Z' : 'Z-A'}
                            </button>
                         </div>

                         <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

                         {/* Sector Pills */}
                         <div className="flex flex-col gap-2 shrink-0">
                            <span className="text-[10px] uppercase tracking-[0.25em] font-black text-foreground/40 ml-1 leading-none">Category</span>
                            <div className="flex p-1 bg-muted/20 border border-border/50 rounded-xl relative h-11">
                              {[
                                { id: '', label: 'All', icon: null },
                                { id: 'family', label: 'Family', icon: <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> },
                                { id: 'adult', label: 'Adult', icon: <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> }
                              ].map(cat => (
                                <button 
                                  key={cat.id}
                                  onClick={() => handleAudienceChange(cat.id)}
                                  className={`relative z-10 flex items-center gap-2 px-5 rounded-lg text-[12px] font-bold transition-colors ${
                                    selectedAudience === cat.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  {selectedAudience === cat.id && (
                                    <motion.div
                                      layoutId="active-audience"
                                      className="absolute inset-0 bg-primary rounded-lg shadow-md -z-10"
                                      transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
                                    />
                                  )}
                                  {cat.icon}
                                  {cat.label}
                                </button>
                              ))}
                            </div>
                         </div>

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
                           className="w-32 pr-4 lg:pr-0"
                         />
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  duration: 0.4, 
                  delay: (idx % 12) * 0.05 
                }}
                whileHover={{ scale: 1.02 }}
                className="flex flex-col gap-4 group"
              >
                <Link href={"/watch/" + movie.id} className={`block relative aspect-poster bg-muted rounded-xl overflow-hidden shadow-xl border-2 border-transparent transition-all duration-300 ${
                  selectedAudience === 'family' ? 'group-hover:shadow-green-500/10 group-hover:border-green-500/20' : 'group-hover:shadow-primary/10 group-hover:border-primary/20'
                }`}>
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

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">
                    {movie.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-muted-foreground/60">{movie.year}</span>
                       <span className="px-1 py-0.5 border border-primary/20 bg-primary/5 rounded-[2px] text-[8px] font-black uppercase tracking-tighter text-primary/60">CC</span>
                    </div>
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
          <div className="mt-20 flex justify-center pb-20">
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
