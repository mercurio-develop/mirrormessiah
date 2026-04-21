'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MovieWithFile } from '@/lib/db';
import { Search, Play, Edit, Loader2, SlidersHorizontal, X, ChevronDown, Monitor, ArrowDownAZ, Terminal, Zap, Fingerprint, Activity } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { motion, AnimatePresence } from 'framer-motion';

interface PublicMoviesListProps {
  initialMovies: MovieWithFile[];
}

const ITEMS_PER_LOAD = 24;

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const cleanPath = thumbnail.replace(/\/+/g, '/');
  return "/api/images?path=" + encodeURIComponent(cleanPath) + "&public=true";
};

export default function PublicMoviesList({ initialMovies }: PublicMoviesListProps) {
  const { isAdmin } = useAdmin();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [sort, setSort] = useState<'title_asc' | 'title_desc'>('title_asc');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [movies, setMovies] = useState<MovieWithFile[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= ITEMS_PER_LOAD);
  const [totalCount, setTotalCount] = useState(0);
  
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialMovies.length);

  const qualities = ['720p', '1080p', '4K'];
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1950;
    const list = [];
    for (let i = currentYear; i >= startYear; i--) list.push(i.toString());
    return list;
  }, []);

  const fetchMovies = useCallback(async (search = '', quality = '', year = '', sortOrder: 'title_asc' | 'title_desc' = 'title_asc', reset = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      let url = "/api/movies?offset=" + currentOffset + "&limit=" + ITEMS_PER_LOAD;

      if (search) url += "&q=" + encodeURIComponent(search);
      if (quality) url += "&quality=" + encodeURIComponent(quality);
      if (year) url += "&year=" + encodeURIComponent(year);
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
          setMovies(prev => [...prev, ...newMovies]);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMovies(searchTerm, selectedQuality, selectedYear, sort, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedQuality, selectedYear, sort, fetchMovies]);

  const handleScroll = useCallback(() => {
    if (loadingRef.current || !hasMore) return;

    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 800) {
      fetchMovies(searchTerm, selectedQuality, selectedYear, sort);
    }
  }, [fetchMovies, hasMore, searchTerm, selectedQuality, selectedYear, sort]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedQuality('');
    setSelectedYear('');
    setSort('title_asc');
    setIsFilterOpen(false);
  };


  const activeFiltersCount = (selectedQuality ? 1 : 0) + (selectedYear ? 1 : 0);

  return (
    <div className="space-y-12">
      {/* Command Center: Filters & Status */}
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full px-4">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-l border-r border-primary/20 bg-primary/5 rounded-t-sm">
          <div className="flex items-center gap-6 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary))]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Registry_Active</span>
            </div>
            <div className="h-4 w-px bg-border/40" />
            <div className="flex items-center gap-2 overflow-hidden">
              <Activity className="h-3.5 w-3.5 text-muted-foreground/30" />
              <span className="text-[10px] font-medium tracking-tight text-muted-foreground whitespace-nowrap">
                Sync Status: <span className="text-foreground/60">{loading ? 'Transferring...' : 'Idle'}</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="h-4 w-px bg-border/40" />
              <Fingerprint className="h-3.5 w-3.5 text-muted-foreground/30" />
              <span className="text-[10px] font-medium tracking-tight text-muted-foreground">
                Matches: <span className="text-primary font-black">{totalCount}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden lg:flex items-center gap-2">
              <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-[0.3em]">Sector_Arch: 0x7E3</span>
            </div>
          </div>
        </div>

        {/* Search & Main Controls */}
        <div className="relative z-20 group">
          <div className="flex flex-col md:flex-row gap-0 shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-border bg-card/60 backdrop-blur-2xl rounded-lg overflow-hidden transition-all duration-500 hover:border-primary/30 group-focus-within:border-primary/50">
            {/* Search Input Section */}
            <div className="relative flex-1 group/input">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/30 group-focus-within/input:text-primary group-focus-within/input:scale-110 transition-all duration-500">
                <Search className="h-full w-full" />
              </div>
              <input
                type="text"
                placeholder="Search movies by ID or title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 bg-transparent pl-14 pr-6 text-sm font-medium focus:outline-none transition-all text-foreground placeholder:text-muted-foreground/30"
              />
              <div className="absolute bottom-0 left-14 right-6 h-px bg-gradient-to-r from-primary/30 to-transparent scale-x-0 group-focus-within/input:scale-x-100 transition-transform duration-700 origin-left" />
            </div>

            {/* Action Buttons */}
            <div className="flex divide-x divide-border border-t md:border-t-0 border-border">
              {/* Sort Toggle */}
              <button
                onClick={() => setSort(sort === 'title_asc' ? 'title_desc' : 'title_asc')}
                className={"px-6 h-16 transition-all flex flex-col items-center justify-center gap-1 group/btn " +
                  (sort === 'title_asc' ? "bg-primary text-primary-foreground shadow-inner" : "text-muted-foreground hover:text-foreground hover:bg-primary/10")}
                title={sort === 'title_asc' ? 'Sort: Title A-Z' : 'Sort: Title Z-A'}
              >
                <ArrowDownAZ className={"h-4 w-4 transition-transform duration-500 " + (sort === 'title_asc' ? "scale-110" : "group-hover:scale-110")} />
                <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">
                  {sort === 'title_asc' ? "ASC" : "DESC"}
                </span>
              </button>

              {/* Filters Panel Toggle */}
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={"relative px-8 h-16 transition-all flex flex-col items-center justify-center gap-1 group/btn overflow-hidden " +
                  (isFilterOpen || activeFiltersCount > 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-primary/10")}
              >
                {activeFiltersCount > 0 && (
                  <div className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </div>
                )}
                <SlidersHorizontal className={"h-4 w-4 transition-transform duration-500 " + (isFilterOpen ? "rotate-90 scale-110" : "group-hover:scale-110")} />
                <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">
                  {isFilterOpen ? "CLOSE" : "PARAMS"}
                </span>
              </button>

              {/* Reset System Button */}
              {(searchTerm || selectedQuality || selectedYear || sort === 'title_asc') && (
                <button 
                  onClick={clearFilters}
                  className="px-6 h-16 bg-destructive/5 text-destructive/40 hover:text-destructive hover:bg-destructive/10 transition-all flex flex-col items-center justify-center gap-1 group/btn"
                  title="Wipe Search Parameters"
                >
                  <Zap className="h-4 w-4 group-hover:scale-110 group-active:scale-90 transition-all" />
                  <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">RESET</span>
                </button>
              )}
            </div>
          </div>

          {/* Expanded Parameters Panel */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden mt-1"
              >
                <div className="p-6 bg-card/40 backdrop-blur-3xl border border-border border-t-0 rounded-b-lg grid grid-cols-1 sm:grid-cols-2 gap-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                  
                  {/* Quality Selector */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60">
                      <Monitor className="h-3 w-3" /> ARCHIVE_QUALITY
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <button 
                        onClick={() => setSelectedQuality('')}
                        className={"h-10 text-[9px] font-black border transition-all rounded-sm " + 
                          (!selectedQuality ? "bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.4)]" : "bg-background/20 border-border text-muted-foreground hover:border-primary/40")}
                      >
                        ALL
                      </button>
                      {qualities.map(q => (
                        <button 
                          key={q}
                          onClick={() => setSelectedQuality(q)}
                          className={"h-10 text-[9px] font-black border transition-all rounded-sm " + 
                            (selectedQuality === q ? "bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.4)]" : "bg-background/20 border-border text-muted-foreground hover:border-primary/40")}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Year/Timeline Selector */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60">
                      <Terminal className="h-3 w-3" /> TEMPORAL_SECTOR
                    </label>
                    <div className="relative">
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="w-full h-10 bg-background/20 border border-border pl-4 pr-10 text-[10px] font-black uppercase tracking-widest appearance-none focus:outline-none focus:border-primary/50 text-foreground cursor-pointer transition-all rounded-sm"
                      >
                        <option value="" className="bg-card">:: ALL_TIMELINES ::</option>
                        {years.slice(0, 30).map(y => <option key={y} value={y} className="bg-card">{y}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none text-primary/40" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Active Nodes / Filter Pills */}
        <AnimatePresence>
          {(searchTerm || selectedQuality || selectedYear) && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-wrap items-center gap-3 px-1"
            >
              <span className="text-[9px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] flex items-center gap-2">
                <Zap className="h-3 w-3" /> ACTIVE_NODES:
              </span>
              
              {searchTerm && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest rounded-full group cursor-default">
                  ID: {searchTerm}
                  <X 
                    className="h-3 w-3 hover:text-white cursor-pointer transition-colors" 
                    onClick={() => setSearchTerm('')}
                  />
                </div>
              )}
              
              {selectedQuality && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest rounded-full group cursor-default">
                  SIGNAL: {selectedQuality}
                  <X 
                    className="h-3 w-3 hover:text-white cursor-pointer transition-colors" 
                    onClick={() => setSelectedQuality('')}
                  />
                </div>
              )}
              
              {selectedYear && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest rounded-full group cursor-default">
                  EPOCH: {selectedYear}
                  <X 
                    className="h-3 w-3 hover:text-white cursor-pointer transition-colors" 
                    onClick={() => setSelectedYear('')}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Grid Display Section */}
      <div className="relative">
        {/* Subtle decorative background scanning line */}
        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/5 to-transparent top-0 animate-pulse" />
        
        {movies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-12 px-6">
            {movies.map((movie, idx) => (
              <motion.div 
                key={movie.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx % 12 * 0.05 }}
                className="group flex flex-col gap-4"
              >
                <Link href={"/watch/" + movie.id} className="block relative aspect-poster border border-border bg-muted overflow-hidden group-hover:border-primary/50 transition-all duration-700 shadow-2xl rounded-md group-hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]">
                  <Image
                    src={getPosterUrl(movie.thumbnail)}
                    alt={movie.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 15vw"
                    className="object-cover transition-all duration-1000 group-hover:scale-110 group-hover:rotate-1"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                  />
                  
                  {/* Glass overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                  <div className="absolute top-2 right-2 z-30 font-mono">
                    <span className="bg-background/80 backdrop-blur-md text-[10px] font-black text-foreground px-2 py-0.5 border border-border uppercase tracking-tighter shadow-2xl rounded-sm">
                      {movie.quality || 'FHD'}
                    </span>
                  </div>

                  <div className="absolute inset-0 z-40 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 bg-primary/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.6)] scale-75 group-hover:scale-100 transition-transform duration-500">
                      <Play className="h-6 w-6 text-primary-foreground fill-current ml-0.5" />
                    </div>
                  </div>
                  
                  {/* Decorative corner brackets */}
                  <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>

                <div className="space-y-2 px-1">
                  <div className="flex flex-col gap-1">
                     <h3 className="font-bold text-sm leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                      {movie.title}
                    </h3>
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span>{movie.year || '3000'}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[9px]">ID: {movie.id}</span>
                    </div>
                  </div>
                  
                  {isAdmin && (
                    <Link 
                      href={"/admin/movies/" + movie.id}
                      className="flex items-center gap-1.5 text-[9px] font-black uppercase text-primary/30 hover:text-primary transition-colors pt-1.5 border-t border-border/50"
                    >
                      <Edit className="h-2.5 w-2.5" /> Modify_Registry
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
              className="flex flex-col items-center justify-center py-48 text-center space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 animate-ping h-12 w-12 bg-primary/20 rounded-full mx-auto" />
                <Terminal className="h-12 w-12 text-primary/40 mx-auto" />
              </div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter text-muted-foreground/40">Sector_Archives_Empty</h3>
              <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground/20 max-w-xs mx-auto">Zero matches detected in current spatial sector. Suggest parameter reset_</p>
              <button 
                onClick={clearFilters}
                className="px-8 py-3 bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-sm"
              >
                Clear_All_Parameters
              </button>
            </motion.div>
          )
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="relative">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <div className="absolute inset-0 h-8 w-8 border-2 border-primary/20 rounded-full animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-black text-primary/60 uppercase tracking-[0.5em] animate-pulse">Synchronizing_Archive_Signal...</span>
            <div className="w-24 h-[2px] bg-muted overflow-hidden rounded-full">
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                className="w-12 h-full bg-primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
