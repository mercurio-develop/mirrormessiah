'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { b64urlEncode } from '@/lib/b64url';
import { 
    Search, 
    Loader2, 
    X, 
    Star, 
    Sparkles,
    ShieldAlert,
    Filter,
    Tv
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Dropdown from '@/components/ui/Dropdown';

export interface Series {
  id: number;
  title: string;
  year: number | null;
  thumbnail: string | null;
  genres: string | null;
  rating: number | null;
  audience: string | null;
  needs_repair: number;
  season_count: number;
}

interface PublicSeriesListProps {
  initialSeries: Series[];
}

const ITEMS_PER_LOAD = 24;

const GENRE_OPTIONS = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 
  'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 
  'Thriller', 'War', 'Western'
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

export default function PublicSeriesList({ initialSeries }: PublicSeriesListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(searchParams.get('genre') || '');
  const [selectedAudience, setSelectedAudience] = useState<'family' | 'adult' | ''>(
    (searchParams.get('audience') as any) || ''
  );
  const [sort, setSort] = useState<'title_asc' | 'title_desc' | 'rating' | 'newest'>('title_asc');
  const [showFilters, setShowFilters] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('mm_series_show_filters');
    if (saved !== null) setShowFilters(saved === 'true');
  }, []);

  const toggleFilters = () => {
    const newState = !showFilters;
    setShowFilters(newState);
    localStorage.setItem('mm_series_show_filters', String(newState));
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
    if (selectedYear) count++;
    if (selectedGenre) count++;
    if (selectedAudience) count++;
    if (sort !== 'title_asc') count++;
    return count;
  }, [debouncedSearch, selectedYear, selectedGenre, selectedAudience, sort]);

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
  
  const [seriesList, setSeriesList] = useState<Series[]>(initialSeries);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialSeries.length >= ITEMS_PER_LOAD);
  const [totalCount, setTotalCount] = useState(0);
  
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialSeries.length);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const list = [];
    for (let i = currentYear; i >= startYear; i--) list.push(i.toString());
    return list;
  }, []);

  const fetchSeries = useCallback(async (search = '', year = '', audience = '', sortOrder: 'title_asc' | 'title_desc' | 'rating' | 'newest' = 'title_asc', genre = '', reset = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      let url = "/api/series?offset=" + currentOffset + "&limit=" + ITEMS_PER_LOAD;

      if (search) url += "&q=" + encodeURIComponent(search);
      if (year) url += "&year=" + encodeURIComponent(year);
      if (audience) url += "&audience=" + encodeURIComponent(audience);
      if (genre) url += "&genre=" + encodeURIComponent(genre);
      url += "&sort=" + sortOrder;
      
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const newSeries = data.series || [];
        setTotalCount(data.total || 0);
        
        if (reset) {
          setSeriesList(newSeries);
          offsetRef.current = newSeries.length;
        } else {
          setSeriesList(prev => {
            const existingIds = new Set(prev.map((s: Series) => s.id));
            const uniqueNewSeries = newSeries.filter((s: Series) => !existingIds.has(s.id));
            return [...prev, ...uniqueNewSeries];
          });
          offsetRef.current += newSeries.length;
        }
        
        setHasMore(newSeries.length >= ITEMS_PER_LOAD);
      }
    } catch (err) {
      console.error('Series_Fetch_Failure:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const [restored, setRestored] = useState({ done: false, didRestore: false });

  useEffect(() => {
    let didRestore = false;
    const saved = sessionStorage.getItem('mm_series_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSearchTerm(state.searchTerm || '');
        setDebouncedSearch(state.searchTerm || '');
        setSelectedYear(state.selectedYear || '');
        setSort(state.sort || 'title_asc');
        
        setSeriesList(state.seriesList || initialSeries);
        offsetRef.current = state.offset || initialSeries.length;
        setHasMore(state.hasMore ?? (initialSeries.length >= ITEMS_PER_LOAD));
        setTotalCount(state.totalCount || 0);

        didRestore = true;

        setTimeout(() => {
          window.scrollTo({ top: state.scrollY || 0, behavior: 'instant' });
          sessionStorage.removeItem('mm_series_state');
        }, 100);
      } catch (e) {}
    }
    
    setRestored({ done: true, didRestore });
  }, [initialSeries]);

  const isInitialMount = useRef(true);
  const lastStateString = useRef('');

  useEffect(() => {
    if (!restored.done) return;

    const currentStateString = JSON.stringify({
      debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre
    });

    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastStateString.current = currentStateString;
      
      if (!restored.didRestore) {
         fetchSeries(debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre, true);
      }
      return;
    }

    if (currentStateString === lastStateString.current) return;

    lastStateString.current = currentStateString;
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchSeries(debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre, true);
  }, [debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre, restored, fetchSeries]);

  const saveStateAndScroll = () => {
    const state = {
      seriesList,
      offset: offsetRef.current,
      hasMore,
      totalCount,
      scrollY: window.scrollY,
      searchTerm,
      selectedYear,
      sort
    };
    sessionStorage.setItem('mm_series_state', JSON.stringify(state));
  };

  const handleScroll = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    const { scrollHeight, scrollTop, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 800) {
      fetchSeries(debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre);
    }
  }, [fetchSeries, hasMore, debouncedSearch, selectedYear, selectedAudience, sort, selectedGenre]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedYear('');
    setSelectedGenre('');
    handleAudienceChange('');
    setSort('title_asc');
  };

  return (
    <div className="space-y-10 pb-24 pt-0">
      <div className={`sticky top-20 z-50 bg-background transition-all duration-300 overflow-visible py-6 ${
        isScrolled ? 'shadow-2xl border-b border-white/[0.04]' : 'border-b border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto w-full px-6 flex flex-col gap-6 overflow-visible relative">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="relative flex-1 max-w-2xl group">
               <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 transition-colors group-focus-within:text-primary">
                  {loading ? <Loader2 className="h-full w-full animate-spin" /> : <Search className="h-full w-full" />}
               </div>
               <input
                  type="text"
                  placeholder="Search your TV series..."
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
                            {totalCount} <span className="hidden sm:inline opacity-60">Series found</span>
                            <span className="sm:hidden">Series</span>
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
                         <Dropdown 
                           label="Order"
                           value={sort}
                           onChange={(val) => setSort(val as any)}
                           options={SORT_OPTIONS}
                           className="w-44"
                         />

                         <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

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

      <div className="max-w-7xl mx-auto w-full px-6">
        {seriesList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
            {seriesList.map((series, idx) => (
              <motion.div 
                key={series.id}
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
                  href={"/series/" + series.id} 
                  onClick={saveStateAndScroll}
                  className={`block relative aspect-poster bg-muted rounded-xl overflow-hidden shadow-xl border-2 border-transparent transition-all duration-300 ${
                    selectedAudience === 'family' ? 'group-hover:shadow-green-500/10 group-hover:border-green-500/20' : 'group-hover:shadow-primary/10 group-hover:border-primary/20'
                  }`}
                >
                  <Image
                    src={getPosterUrl(series.thumbnail)}
                    alt={series.title}
                    fill
                    unoptimized
                    priority={idx < 6}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {series.needs_repair === 1 && (
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
                      {series.title}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] font-black text-amber-500 shrink-0">
                       <Star className="h-3 w-3 fill-current" />
                       {series.rating ? series.rating.toFixed(1) : '0.0'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-tight">
                       <span>{series.year}</span>
                       <span className="opacity-30">•</span>
                       <span className="tracking-tighter">{series.season_count} Season{series.season_count !== 1 ? 's' : ''}</span>
                    </div>

                    {series.audience === 'family' && (
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
                 <Tv className="h-20 w-20 text-muted-foreground/10 mx-auto" />
               )}
               <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedAudience === 'family' ? 'Oh no! The magic is hidden!' : 'No series found'}
              </h2>
              <p className="text-muted-foreground max-w-xs mx-auto text-sm leading-relaxed">
                {selectedAudience === 'family' 
                  ? "We couldn't find any magic series with those search words. Try something else!"
                  : "We couldn't find any series matching your current search parameters."}
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
              {selectedAudience === 'family' ? 'See All Magic Series' : 'Reset All Filters'}
            </button>
          </div>
        )}
        
        {hasMore && (
          <div className="mt-20 flex justify-center pb-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] animate-pulse">Syncing series...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
