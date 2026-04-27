'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { b64urlEncode } from '@/lib/b64url';
import { Save, Loader2, AlertCircle, Trash2, Globe, Info, Search, Film, Calendar, Star, Sparkles, ChevronDown, Tv } from 'lucide-react';
import FileBrowser from '@/components/FileBrowser';
import DeleteSeriesModal from './DeleteSeriesModal';
import { updateSeriesAction } from '../actions/update-series';
import { scrapeSeriesAction } from '../actions/scrape-series';

// Minimal type needed for the form
interface Series {
  id: number;
  title: string;
  year: number | null;
  plot: string | null;
  rating: number | null;
  genres: string | null;
  director: string | null;
  language: string | null;
  audience: string | null;
  thumbnail: string | null;
  needs_repair: number;
}

interface AdminSeriesFormProps {
  series: Series;
}

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  
  const [basePath, query] = thumbnail.split('?');
  let url = "/api/images?path=" + b64urlEncode(basePath);
  if (query) url += "&" + query;
  
  return url;
};

export default function AdminSeriesForm({ series }: AdminSeriesFormProps) {
  const router = useRouter();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isScraping, setIsScraping] = useState(false);
  
  const [formData, setFormData] = useState({
    title: series.title || '',
    year: series.year?.toString() || '',
    plot: series.plot || '',
    rating: series.rating?.toString() || '',
    genres: series.genres || '',
    director: series.director || '',
    language: series.language || '',
    audience: series.audience || '',
    thumbnail: series.thumbnail || '',
    needs_repair: series.needs_repair === 1,
  });

  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: '' });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    const val = type === 'checkbox' ? (e.target as any).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handlePosterSelect = async (filePath: string) => {
    setIsBrowserOpen(false);
    startTransition(async () => {
        const result = await updateSeriesAction(series.id, {
            thumbnail: filePath
        });

        if (result.status === 'success') {
            const cacheBuster = filePath + (filePath.includes('?') ? '&' : '?') + 't=' + Date.now();
            setFormData(prev => ({ ...prev, thumbnail: cacheBuster }));
            setStatus({ type: 'success', msg: 'Poster updated successfully' });
        } else {
            setStatus({ type: 'error', msg: result.message || 'Poster update failed' });
        }
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setStatus({ type: null, msg: '' });

    startTransition(async () => {
        const result = await updateSeriesAction(series.id, {
            ...formData,
            thumbnail: formData.thumbnail.split('?')[0],
            year: formData.year ? parseInt(formData.year) : null,
            rating: formData.rating ? parseFloat(formData.rating) : null,
            needs_repair: formData.needs_repair ? 1 : 0,
        });

        if (result.status === 'success') {
            setStatus({ type: 'success', msg: result.message || 'Updated' });
            setTimeout(() => router.push('/admin/series'), 1000);
        } else {
            setStatus({ type: 'error', msg: result.message || 'Update failed' });
        }
    });
  };

  const handleScrape = async () => {
    setIsScraping(true);
    setStatus({ type: null, msg: '' });
    
    const result = await scrapeSeriesAction(series.id);
    
    if (result.status === 'success') {
        // Optimistic refresh - rely on server action revalidation for next load, but let's just trigger a reload or show success
        setStatus({ type: 'success', msg: result.message || 'Metadata synced. Please refresh to see changes.' });
        window.location.reload();
    } else {
        setStatus({ type: 'error', msg: result.message || 'Scrape failed' });
    }
    setIsScraping(false);
  };

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };
  
  const posterUrl = getPosterUrl(formData.thumbnail);

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-10 font-sans pb-32 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          <div className="order-2 lg:order-1 lg:col-span-8 space-y-8">
            <div className="p-6 sm:p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Tv className="h-5 w-5 text-blue-500" />
                 <h3 className="text-lg font-bold text-foreground">Core Identity</h3>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Series Title</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g. Breaking Bad"
                    className="w-full h-14 bg-background border border-border rounded-xl px-6 text-base font-semibold focus:border-blue-500 transition-all text-foreground outline-none focus:ring-4 focus:ring-blue-500/5"
                  />
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">First Air Year</label>
                    <div className="relative">
                       <Calendar className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <input
                        name="year"
                        type="number"
                        value={formData.year}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-10 sm:pl-12 pr-2 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Rating</label>
                    <div className="relative">
                       <Star className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <input
                        name="rating"
                        type="number"
                        step="0.1"
                        value={formData.rating}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-10 sm:pl-12 pr-2 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Audience</label>
                    <div className="relative">
                       <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <select
                        name="audience"
                        value={formData.audience}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-10 sm:pl-12 pr-8 sm:pr-10 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all appearance-none"
                      >
                        <option value="">Standard</option>
                        <option value="family">Family</option>
                        <option value="adult">Adult</option>
                      </select>
                      <ChevronDown className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
                    <input
                      id="needs_repair"
                      name="needs_repair"
                      type="checkbox"
                      checked={formData.needs_repair}
                      onChange={handleInputChange}
                      className="h-5 w-5 rounded border-destructive/20 text-destructive focus:ring-destructive/30"
                    />
                    <label htmlFor="needs_repair" className="flex items-center gap-2 cursor-pointer">
                       <AlertCircle className={`h-4 w-4 ${formData.needs_repair ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
                       <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">Flag for Repair</span>
                          <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground uppercase">Needs manual intervention or re-sync</span>
                       </div>
                    </label>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Globe className="h-5 w-5 text-blue-500" />
                 <h3 className="text-lg font-bold text-foreground">Production Details</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Genres</label>
                  <input
                    name="genres"
                    value={formData.genres}
                    onChange={handleInputChange}
                    placeholder="Action, Drama, Sci-Fi"
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Showrunner / Creator</label>
                  <input
                    name="director"
                    value={formData.director}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Language</label>
                  <input
                    name="language"
                    value={formData.language}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Info className="h-5 w-5 text-blue-500" />
                 <h3 className="text-lg font-bold text-foreground">Synopsis</h3>
              </div>
              <textarea
                name="plot"
                rows={6}
                value={formData.plot}
                onChange={handleInputChange}
                placeholder="Brief description of the series..."
                className="w-full bg-background border border-border rounded-xl p-6 text-sm font-medium leading-relaxed text-foreground/80 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            
            {/* Note: Season/Episode manager could go here in the future */}
            <div className="p-6 sm:p-8 bg-muted/20 border border-border rounded-2xl flex items-center justify-center text-muted-foreground text-sm font-medium italic">
                Advanced Episode Management and Subtitles Configuration coming soon.
            </div>
            
          </div>

          <div className="order-1 lg:order-2 lg:col-span-4 space-y-8">
            <div className="p-6 bg-card border border-border rounded-2xl space-y-6 shadow-xl">
              <div className="w-full aspect-poster relative bg-muted rounded-xl overflow-hidden shadow-inner group">
                 <Image
                  src={posterUrl}
                  alt="Preview"
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-1000 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
                <div className="absolute inset-0 flex items-center justify-center lg:opacity-0 group-hover:opacity-100 transition-all bg-black/60 backdrop-blur-sm">
                   <button 
                     type="button"
                     onClick={() => setIsBrowserOpen(true)}
                     className="px-6 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest shadow-2xl flex items-center gap-2 rounded-full hover:scale-105 active:scale-95 transition-all"
                   >
                     <Search className="h-3.5 w-3.5" /> Browse Posters
                   </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Thumbnail Path</label>
                <input
                  name="thumbnail"
                  value={formData.thumbnail}
                  onChange={handleInputChange}
                  className="w-full h-10 bg-muted/30 border border-border rounded-lg px-4 text-[10px] font-mono text-blue-500/60 focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                disabled={isScraping || isPending}
                onClick={handleScrape}
                className="w-full h-14 bg-zinc-900 border border-zinc-800 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isScraping ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5" /> Scrape from TMDB</>}
              </button>

              <button
                type="submit"
                disabled={isPending || isScraping}
                className="hidden lg:flex w-full h-14 bg-blue-600 text-white text-sm font-bold rounded-2xl items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-5 w-5" /> Save Changes</>}
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="w-full h-14 border border-destructive/20 text-destructive/60 hover:text-destructive hover:bg-destructive/5 text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="h-5 w-5" /> Delete Series
              </button>

              {status.msg && (
                <div className={`p-4 border text-xs font-bold flex items-center gap-3 rounded-xl animate-in fade-in slide-in-from-bottom-2 ${status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                  <AlertCircle className="h-4 w-4" /> {status.msg}
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="lg:hidden fixed bottom-6 right-6 left-6 z-[60] animate-in slide-in-from-bottom-10 duration-500">
           <button
            type="submit"
            disabled={isPending || isScraping}
            className="w-full h-16 bg-blue-600 text-white font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_50px_rgba(37,99,235,0.3)] active:scale-95 transition-all disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-6 w-6" /> Commit Changes</>}
          </button>
        </div>
      </form>

      <FileBrowser 
        movieId={series.id}
        mediaType="series"
        isOpen={isBrowserOpen}
        mode="images"
        onClose={() => setIsBrowserOpen(false)}
        onSelect={handlePosterSelect}
      />

      <DeleteSeriesModal
        series={{ id: series.id, title: formData.title }}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onDeleted={() => router.push('/admin/series')}
      />
    </>
  );
}
