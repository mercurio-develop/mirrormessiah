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
    Filter
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
    <div className="space-y-10 pb-24 pt-6">
      {/* Search & Filters Section - GLASSMORPHISM CONTAINER */}
      <div className="sticky top-20 z-50 bg-background/40 backdrop-blur-2xl border-b border-white/[0.05] shadow-2xl py-8">
        <div className="max-w-7xl mx-auto w-full px-6 flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="relative flex-1 max-w-3xl group">
               <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary">
                  {loading ? <Loader2 className="h-full w-full animate-spin" /> : <Search className="h-full w-full" />}
               </div>
               <input
                  type="text"
                  placeholder="Search Registry..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 bg-transparent pl-8 pr-48 text-2xl font-bold tracking-tight placeholder:text-muted-foreground/20 focus:outline-none border-none transition-all"
               />
               <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3 pr-1">
                  {isFiltered && (
                     <button 
                       onClick={clearFilters} 
                       className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-[10px] font-black uppercase tracking-widest rounded-lg border border-destructive/20 transition-all active:scale-95"
                     >
                        <X className="h-3 w-3" /> Clear
                     </button>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/20 shadow-sm shadow-primary/5">
                      {totalCount} Archive Entities
                  </span>
               </div>
            </div>
          </div>

          <LayoutGroup>
            {/* Filter Row - Horizontally scrollable on mobile */}
            <div className="flex flex-nowrap lg:flex-wrap items-end gap-5 overflow-x-auto pb-2 -mx-6 px-6 lg:mx-0 lg:px-0 scrollbar-hide">
               {/* Sort Toggle */}
               <div className="flex flex-col gap-2 shrink-0">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-black text-foreground/40 ml-1 leading-none">Sort</span>
                  <button 
                      onClick={() => setSort(sort === 'title_asc' ? 'title_desc' : 'title_asc')}
                      className={`flex items-center gap-2 px-4 h-11 rounded-xl border text-[13px] font-bold transition-all shadow-md active:scale-95 ${
                        sort === 'title_asc' 
                          ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_20px_rgba(56,189,248,0.2)] ring-2 ring-primary/10' 
                          : 'bg-muted/20 border-border/50 hover:border-primary/30 text-foreground/80 hover:bg-muted/40'
                      }`}
                  >
                      {sort === 'title_asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
                      {sort === 'title_asc' ? 'Title A-Z' : 'Title Z-A'}
                  </button>
               </div>

               <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

               {/* Audience Selection - SPATIAL PILLS */}
               <div className="flex flex-col gap-2 shrink-0">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-black text-foreground/40 ml-1 leading-none">Sector</span>
                  <div className="flex p-1 bg-muted/20 border border-border/50 rounded-xl relative">
                    {[
                      { id: '', label: 'All', icon: null },
                      { id: 'family', label: 'Family', icon: <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" /> },
                      { id: 'adult', label: 'Adult', icon: <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" /> }
                    ].map(cat => (
                      <button 
                        key={cat.id}
                        onClick={() => handleAudienceChange(cat.id)}
                        className={`relative z-10 flex items-center gap-2 px-5 h-9 rounded-lg text-[12px] font-bold transition-colors ${
                          selectedAudience === cat.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {selectedAudience === cat.id && (
                          <motion.div
                            layoutId="active-audience"
                            className="absolute inset-0 bg-primary rounded-lg shadow-lg shadow-primary/20 -z-10"
                            transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}
                          />
                        )}
                        {cat.icon}
                        {cat.label}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="h-8 w-px bg-border/40 mx-1 hidden lg:block mb-1.5 shrink-0" />

               {/* Genre Custom Dropdown */}
               <Dropdown 
                 label="Genre"
                 placeholder="All Genres"
                 value={selectedGenre}
                 onChange={handleGenreChange}
                 options={GENRE_OPTIONS.map(g => ({ value: g, label: g }))}
                 className="w-44"
               />

               {/* Quality Custom Dropdown */}
               <Dropdown 
                 label="Format"
                 placeholder="All Resolutions"
                 value={selectedQuality}
                 onChange={setSelectedQuality}
                 options={qualities.map(q => ({ value: q, label: q }))}
                 className="w-40"
               />

               {/* Year Custom Dropdown */}
               <Dropdown 
                 label="Archive"
                 placeholder="All Eras"
                 value={selectedYear}
                 onChange={setSelectedYear}
                 options={years.slice(0, 50).map(y => ({ value: y, label: y }))}
                 className="w-36 pr-4 lg:pr-0"
               />
            </div>
          </LayoutGroup>
        </div>
      </div>

      {/* Grid Display Section */}
      <div className="max-w-7xl mx-auto w-full px-6">
        {movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
            {movies.map((movie, idx) => (
              <motion.div 
                key={movie.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  type: 'spring', 
                  duration: 0.5, 
                  bounce: selectedAudience === 'family' ? 0.4 : 0.2,
                  delay: (idx % 12) * 0.05 
                }}
                whileHover={selectedAudience === 'family' ? { scale: 1.05, rotate: [0, -1, 1, 0] } : { y: -5 }}
                className="flex flex-col gap-4 group"
              >
                <Link href={"/watch/" + movie.id} className={`block relative aspect-poster bg-muted rounded-lg overflow-hidden content-scale shadow-xl ${
                  selectedAudience === 'family' ? 'group-hover:shadow-green-500/20 group-hover:border-green-500/30 border-2 border-transparent transition-all' : 'group-hover:shadow-primary/10'
                }`}>
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

                  {selectedAudience === 'family' && (
                    <div className="absolute top-2 left-2 p-1.5 bg-green-500 rounded-full shadow-lg shadow-green-500/50 animate-bounce">
                      <Sparkles className="h-3 w-3 text-white fill-current" />
                    </div>
                  )}
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
                            Family Friendly
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
                 <Sparkles className="h-20 w-20 text-green-500/20 mx-auto animate-pulse" />
               ) : (
                 <Search className="h-20 w-20 text-muted-foreground/10 mx-auto" />
               )}
               <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedAudience === 'family' ? 'Oh no! The magic is hidden!' : 'No entities found'}
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
              <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] animate-pulse">Synchronizing Archives...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
