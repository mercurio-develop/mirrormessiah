'use client';

import { useState, useRef, useEffect, useCallback, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { b64urlEncode } from '@/lib/b64url';
import {
  Search,
  Play,
  Edit,
  Loader2,
  Calendar,
  Hash,
  Activity,
  Tv,
  X,
  AlertCircle,
  ImageOff,
  CheckCircle2,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  Zap,
  ShieldAlert, Sparkles,
  Layers
} from 'lucide-react';
import Dropdown from '@/components/ui/Dropdown';
import ValidateAssetsModal from '@/features/movie/components/ValidateAssetsModal';

// Actions
import { validateSeriesThumbnailsAction } from '../actions/validate-series-thumbnails';
import { deleteSeriesAction } from '../actions/delete-series';
import { scrapeSeriesBulkAction } from '../actions/scrape-series';
import { updateSeriesAudienceAction } from '../actions/update-audience';

// Using a simplified type for the list view
interface SeriesWithStats {
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

interface AdminSeriesListProps {
  initialSeries: SeriesWithStats[];
}

const ITEMS_PER_LOAD = 50;

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = "/api/images?path=" + b64urlEncode(basePath);
  if (query) url += "&" + query;
  return url;
};

const SORT_OPTIONS = [
    { value: 'title_asc', label: 'Title A-Z' },
    { value: 'title_desc', label: 'Title Z-A' },
    { value: 'newest', label: 'Latest Added' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'repair', label: 'Needs Repair' }
];

export default function AdminSeriesList({ initialSeries }: AdminSeriesListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  const currentSort = searchParams.get('sort') || 'title_asc';
  const currentAudience = (searchParams.get('audience') || '') as 'family' | 'adult' | '';

  const [seriesList, setSeriesList] = useState<SeriesWithStats[]>(initialSeries);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isValidateModalOpen, setIsValidateModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialSeries.length >= 24);
  const [totalCount, setTotalCount] = useState(0);

  const loadingRef = useRef(false);
  const offsetRef = useRef(initialSeries.length);
  const [restored, setRestored] = useState({ done: false, didRestore: false });
  const scrollRestored = useRef(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('mm_admin_series_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setSearchTerm(state.search || '');
        setDebouncedSearch(state.search || '');
        
        if (state.seriesList && state.seriesList.length > 0) {
            setSeriesList(state.seriesList);
            offsetRef.current = state.offset || state.seriesList.length;
            setHasMore(state.hasMore ?? true);
            setTotalCount(state.totalCount || 0);
        }

        if (state.sort && state.sort !== currentSort) {
            updateParams({ sort: state.sort });
        }
        
        setRestored({ done: true, didRestore: true });
      } catch (e) {
        setRestored({ done: true, didRestore: false });
      }
    } else {
      setRestored({ done: true, didRestore: false });
    }
  }, []);

  useEffect(() => {
    if (restored.didRestore && seriesList.length > 0 && !scrollRestored.current) {
        const saved = sessionStorage.getItem('mm_admin_series_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                if (state.scrollY) {
                    scrollRestored.current = true;
                    const timer = setTimeout(() => {
                        window.scrollTo({ top: state.scrollY, behavior: 'instant' });
                        sessionStorage.removeItem('mm_admin_series_state');
                    }, 100);
                    return () => clearTimeout(timer);
                }
            } catch (e) {}
        }
    }
  }, [restored.didRestore, seriesList.length]);

  const saveStateAndScroll = () => {
    const state = {
        search: debouncedSearch,
        sort: currentSort,
        audience: currentAudience,
        scrollY: window.scrollY,
        seriesList: seriesList,
        offset: offsetRef.current,
        hasMore: hasMore,
        totalCount: totalCount
    };
    sessionStorage.setItem('mm_admin_series_state', JSON.stringify(state));
  };

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const fetchSeries = useCallback(async (search = '', sort = currentSort, audience = currentAudience, reset = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const currentOffset = reset ? 0 : offsetRef.current;
      let url = `/api/series?offset=${currentOffset}&limit=${ITEMS_PER_LOAD}&sort=${sort}`;
      if (search) url += "&q=" + encodeURIComponent(search);
      if (audience) url += "&audience=" + audience;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const newSeries = data.series || [];
        setTotalCount(data.total || 0);
        
        if (reset) {
          setSeriesList(newSeries);
          offsetRef.current = newSeries.length;
        } else {
          setSeriesList(prev => {
            const existingIds = new Set(prev.map((m: SeriesWithStats) => m.id));
            const uniqueNewSeries = newSeries.filter((m: SeriesWithStats) => !existingIds.has(m.id));
            return [...prev, ...uniqueNewSeries];
          });
          offsetRef.current += newSeries.length;
        }
        
        setHasMore(newSeries.length >= ITEMS_PER_LOAD);
      }
    } catch (err) {
      console.error('Registry_Fetch_Failure:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [currentSort, currentAudience]);

  const handleValidateAssets = async () => {
    setValidating(true);
    try {
      const res = await validateSeriesThumbnailsAction();
      if (res.status === 'success') {
        setSuccessMessage(res.message);
        setTimeout(() => setSuccessMessage(null), 5000);
        fetchSeries(debouncedSearch, currentSort, currentAudience, true);
      } else {
        alert('Validation failed: ' + res.message);
      }
    } catch (err) {
      alert('Error validating assets.');
    } finally {
      setValidating(false);
      setIsValidateModalOpen(false);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (!confirm(`Are you sure you want to purge ${count} selected series from the registry? (Files will NOT be deleted)`)) {
        return;
    }

    startTransition(async () => {
        const result = await deleteSeriesAction(Array.from(selectedIds), { deleteFiles: false, deleteDirectory: false });
        if (result.status === 'success') {
            setSuccessMessage(result.message);
            setTimeout(() => setSuccessMessage(null), 5000);
            setSelectedIds(new Set());
            fetchSeries(debouncedSearch, currentSort, currentAudience, true);
        } else {
            alert(result.message);
        }
    });
  };

  const handleBulkScrape = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    startTransition(async () => {
        const result = await scrapeSeriesBulkAction(Array.from(selectedIds));
        if (result.status === 'success') {
            setSuccessMessage(result.message);
            setTimeout(() => setSuccessMessage(null), 5000);
            setSelectedIds(new Set());
            fetchSeries(debouncedSearch, currentSort, currentAudience, true);
        } else {
            alert(result.message);
        }
    });
  };

  const handleBulkAudienceUpdate = async (audience: 'family' | 'adult' | null) => {
    const count = selectedIds.size;
    if (count === 0) return;

    startTransition(async () => {
        const result = await updateSeriesAudienceAction(Array.from(selectedIds), audience);
        if (result.status === 'success') {
            setSuccessMessage(result.message);
            setTimeout(() => setSuccessMessage(null), 5000);
            setSelectedIds(new Set());
            fetchSeries(debouncedSearch, currentSort, currentAudience, true);
        } else {
            alert(result.message);
        }
    });
  };

  const handleToggleAudience = async (seriesId: number, audience: string | null) => {
    const newAudience = audience === 'family' ? 'adult' : 'family';
    startTransition(async () => {
        const result = await updateSeriesAudienceAction([seriesId], newAudience);
        if (result.status === 'success') {
            fetchSeries(debouncedSearch, currentSort, currentAudience as any, true);
        }
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === seriesList.length) {
        setSelectedIds(new Set());
    } else {
        setSelectedIds(new Set(seriesList.map(s => s.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      if (searchTerm !== (searchParams.get('q') || '')) {
        updateParams({ q: searchTerm || null });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, searchParams, updateParams]);

  // Trigger fetch on filter change
  const lastStateKey = useRef('');
  useEffect(() => {
    if (!restored.done) return;

    const currentKey = JSON.stringify({ search: debouncedSearch, sort: currentSort, audience: currentAudience });
    if (lastStateKey.current === '') {
        lastStateKey.current = currentKey;
        // If we restored, don't fetch immediately
        if (restored.didRestore) return;
    }

    if (lastStateKey.current !== currentKey) {
        lastStateKey.current = currentKey;
        fetchSeries(debouncedSearch, currentSort, currentAudience, true);
    }
  }, [debouncedSearch, currentSort, currentAudience, fetchSeries, restored.done, restored.didRestore]);

  // Infinite Scroll
  useEffect(() => {
    const handleScroll = () => {
      if (loadingRef.current || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollTop + clientHeight >= scrollHeight - 800) {
        fetchSeries(debouncedSearch, currentSort, currentAudience);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchSeries, hasMore, debouncedSearch, currentSort, currentAudience]);

  const clearSearch = () => {
    setSearchTerm('');
    updateParams({ q: null });
  };

  return (
    <div className="space-y-10 font-sans">
      <ValidateAssetsModal 
        isOpen={isValidateModalOpen}
        onClose={() => setIsValidateModalOpen(false)}
        onConfirm={handleValidateAssets}
        isLoading={validating}
      />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="flex flex-1 flex-wrap items-end gap-x-4 gap-y-6 lg:gap-6">
            <div className="flex flex-col gap-2 flex-1 min-w-[280px]">
               <span className="text-[10px] uppercase tracking-[0.2em] font-black text-foreground/40 ml-1">Search Identifier</span>
               <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </div>
                    <input
                        type="text"
                        placeholder="Title, Year..."
                        className="w-full h-11 bg-muted/30 border border-border/50 pl-11 pr-12 text-sm font-semibold focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all outline-none rounded-xl"
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
            </div>

            <Dropdown 
                label="Order"
                value={currentSort}
                onChange={(val) => updateParams({ sort: val })}
                options={SORT_OPTIONS}
                className="w-48"
            />

            <Dropdown 
                label="Category"
                value={currentAudience}
                onChange={(val) => updateParams({ audience: val || null })}
                options={[
                    { value: '', label: 'All' },
                    { value: 'family', label: 'Family' },
                    { value: 'adult', label: 'Adult' }
                ]}
                className="w-36"
            />

            <div className="flex items-end gap-2 relative">
                {successMessage && (
                    <div className="absolute -top-12 left-0 right-0 animate-in slide-in-from-bottom-2 fade-in duration-500 z-50">
                        <div className="bg-green-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {successMessage}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-black text-foreground/40 ml-1">Maintenance</span>
                    <button
                        onClick={() => setIsValidateModalOpen(true)}
                        disabled={validating}
                        className={`h-11 px-5 rounded-xl border flex items-center gap-2.5 text-[11px] font-black uppercase tracking-widest transition-all ${
                            validating 
                            ? 'bg-primary/10 border-primary text-primary' 
                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30'
                        }`}
                    >
                        {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sync Assets
                    </button>
                </div>
            </div>
        </div>

        <div className="shrink-0 flex items-center gap-4">
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in slide-in-from-right-4">
                    <button
                        onClick={() => handleBulkAudienceUpdate('family')}
                        disabled={isPending}
                        className="h-11 px-6 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg shadow-green-500/20 active:scale-95"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 fill-current" />}
                        Mark Family
                    </button>
                    
                    <button
                        onClick={() => handleBulkAudienceUpdate('adult')}
                        disabled={isPending}
                        className="h-11 px-6 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                        Mark Adult
                    </button>

                    <button
                        onClick={handleBulkScrape}
                        disabled={isPending}
                        className="h-11 px-6 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />}
                        Scrape {selectedIds.size}
                    </button>
                    
                    <button
                        onClick={handleBulkDelete}
                        disabled={isPending}
                        className="h-11 px-6 bg-destructive text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-destructive/90 transition-all flex items-center gap-2 shadow-lg shadow-destructive/20 active:scale-95"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Purge {selectedIds.size}
                    </button>
                </div>
            )}

            <span className="inline-flex items-center gap-3 px-4 py-2 bg-muted/20 border border-border/50 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                    {totalCount} <span className="hidden sm:inline">Collection Entries</span>
                    <span className="sm:hidden">Total</span>
                </span>
            </span>
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-2 bg-muted/10 border border-border/40 rounded-xl">
        <button 
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
            {selectedIds.size === seriesList.length && seriesList.length > 0 ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            {selectedIds.size === seriesList.length && seriesList.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
        {selectedIds.size > 0 && (
            <div className="h-4 w-px bg-border/40" />
        )}
        <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">
            {selectedIds.size} Items Targeted for Operation
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {seriesList.length > 0 ? seriesList.map((series, idx) => (
          <div 
            key={series.id} 
            onClick={() => {
                saveStateAndScroll();
                toggleSelect(series.id);
            }}
            className={`bg-muted/10 border p-4 flex gap-5 group hover:bg-muted/20 transition-all duration-300 rounded-2xl relative overflow-hidden cursor-pointer ${
                selectedIds.has(series.id) ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:border-border/60'
            }`}
          >
            <div className={`absolute top-4 right-4 z-20 transition-all duration-300 ${selectedIds.has(series.id) ? 'scale-110 opacity-100' : 'scale-90 opacity-0 group-hover:opacity-40'}`}>
                {selectedIds.has(series.id) ? <CheckCircle2 className="h-5 w-5 text-primary fill-background" /> : <div className="h-5 w-5 border-2 border-muted-foreground rounded-full" />}
            </div>

            <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover:opacity-[0.05] transition-opacity">
                <span className="text-8xl font-black italic">{series.id}</span>
            </div>

            <div className="w-20 shrink-0 relative aspect-poster bg-muted rounded-lg overflow-hidden shadow-sm border border-white/[0.03]">
               <Image
                  src={getPosterUrl(series.thumbnail)}
                  alt={series.title}
                  fill
                  unoptimized
                  priority={idx < 4}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="80px"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
            </div>
            
            <div className="flex-1 flex flex-col justify-between min-w-0 py-0.5 relative z-10">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.15em]">
                   <span className="font-mono">ID_{series.id}</span>
                   <div className="flex items-center gap-1.5">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAudience(series.id, series.audience);
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-all hover:scale-105 active:scale-95 ${
                                series.audience === 'family' 
                                ? 'text-green-500 bg-green-500/5 border-green-500/10' 
                                : 'text-red-500 bg-red-500/5 border-red-500/10'
                            }`}
                            title={`Click to mark as ${series.audience === 'family' ? 'Adult' : 'Family'}`}
                        >
                            {series.audience === 'family' ? (
                                <><Sparkles className="h-2.5 w-2.5 fill-current" /> FAMILY</>
                            ) : (
                                <><ShieldAlert className="h-2.5 w-2.5" /> ADULT</>
                            )}
                        </button>

                        {series.needs_repair ? (
                            <span className="flex items-center gap-1 text-destructive bg-destructive/5 px-1.5 py-0.5 rounded border border-destructive/10 animate-pulse">
                                <AlertCircle className="h-2.5 w-2.5" /> REPAIR_REQUIRED
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-primary/40"><Activity className="h-2.5 w-2.5" /> REGISTRY_SYNCED</span>
                        )}
                   </div>
                </div>
                <h3 className="text-sm font-black text-foreground/90 truncate group-hover:text-primary transition-colors pr-8">
                  {series.title}
                </h3>
                <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground/50 uppercase">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3 opacity-60" /> {series.year || 'N/A'}</span>
                  <div className="w-1 h-1 rounded-full bg-border" />
                  <span className="flex items-center gap-1.5"><Layers className="h-3 w-3 opacity-60" /> {series.season_count || 0} Seasons</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={"/series/" + series.id}
                  onClick={saveStateAndScroll}
                  className="flex-1 h-9 bg-muted/40 border border-border/50 hover:border-white/10 text-[9px] font-black uppercase tracking-widest text-foreground/80 hover:bg-white/5 transition-all flex items-center justify-center gap-2 rounded-lg"
                >
                  <Play className="h-2.5 w-2.5 fill-current" /> View
                </Link>
                <Link
                  href={"/admin/series/" + series.id}
                  onClick={saveStateAndScroll}
                  className="flex-1 h-9 bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase tracking-widest text-blue-500 hover:bg-blue-500 hover:text-white transition-all flex items-center justify-center gap-2 rounded-lg"
                >
                  <Edit className="h-2.5 w-2.5" /> Manage
                </Link>
              </div>
            </div>
          </div>
        )) : (
            <div className="col-span-full py-20 text-center space-y-4">
                <ImageOff className="h-12 w-12 text-muted-foreground/20 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">No entities match your active filters.</p>
                <button 
                    onClick={() => router.push(pathname)}
                    className="text-xs font-bold text-primary uppercase tracking-widest hover:underline"
                >
                    Reset Registry Filters
                </button>
            </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      )}
    </div>
  );
}
