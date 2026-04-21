'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Movie } from '@/lib/types';
import { b64urlEncode } from '@/lib/b64url';
import { Save, Loader2, AlertCircle, Trash2, Globe, Info, Search, Film, Calendar, Star, Clock, Sparkles, ChevronDown } from 'lucide-react';
import FileBrowser from './FileBrowser';
import SubtitleManager from './SubtitleManager';

interface AdminMovieFormProps {
  movie: Movie;
}

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  return "/api/images?path=" + b64urlEncode(thumbnail);
};

export default function AdminMovieForm({ movie }: AdminMovieFormProps) {
  const router = useRouter();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    title: movie.title || '',
    year: movie.year?.toString() || '',
    quality: movie.quality || '',
    plot: movie.plot || '',
    rating: movie.rating?.toString() || '',
    genres: movie.genres || '',
    director: (movie as any).director || '',
    language: (movie as any).language || '',
    runtime: (movie as any).runtime?.toString() || '',
    audience: movie.audience || '',
    thumbnail: movie.thumbnail || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: '' });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePosterSelect = async (filePath: string) => {
    setIsBrowserOpen(false);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/movies/" + movie.id + "/poster", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      
      if (res.ok) {
        const data = await res.json();
        setFormData(prev => ({ ...prev, thumbnail: data.thumbnail }));
        setStatus({ type: 'success', msg: 'Poster updated successfully' });
      }
    } catch (err) {
      console.error('Poster selection error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, msg: '' });

    try {
      const response = await fetch("/api/movies/" + movie.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          year: formData.year ? parseInt(formData.year) : null,
          rating: formData.rating ? parseFloat(formData.rating) : null,
          runtime: formData.runtime ? parseInt(formData.runtime) : null,
        }),
      });

      if (!response.ok) throw new Error('Update failed');

      setStatus({ type: 'success', msg: 'Registry entry synchronized' });
      setTimeout(() => router.push('/admin/movies'), 1000);
    } catch (err) {
      setStatus({ type: 'error', msg: 'Failed to update registry entry' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScrape = async () => {
    setIsScraping(true);
    setStatus({ type: null, msg: '' });
    try {
      const res = await fetch(`/api/movies/${movie.id}/scrape-metadata`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Scrape failed');
      }
      // Reload updated movie data into form
      const updated = await fetch(`/api/movies/${movie.id}`).then(r => r.json());
      const m = updated.movie;
      setFormData({
        title: m.title || '',
        year: m.year?.toString() || '',
        quality: m.quality || '',
        plot: m.plot || '',
        rating: m.rating?.toString() || '',
        genres: m.genres || '',
        director: m.director || '',
        language: m.language || '',
        runtime: m.runtime?.toString() || '',
        audience: m.audience || '',
        thumbnail: m.thumbnail || '',
      });
      setStatus({ type: 'success', msg: 'Metadata synced from TMDB' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setIsScraping(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete this movie from the registry?')) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/movies/" + movie.id, { method: 'DELETE' });
      if (response.ok) {
        router.push('/admin/movies');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const posterUrl = getPosterUrl(formData.thumbnail);

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-10 font-sans pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          <div className="lg:col-span-8 space-y-8">
            {/* Core Details */}
            <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Film className="h-5 w-5 text-primary" />
                 <h3 className="text-lg font-bold text-foreground">Core Identity</h3>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Movie Title</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g. Inception"
                    className="w-full h-14 bg-background border border-border rounded-xl px-6 text-base font-semibold focus:border-primary transition-all text-foreground outline-none focus:ring-4 focus:ring-primary/5"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Year</label>
                    <div className="relative">
                       <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <input
                        name="year"
                        type="number"
                        value={formData.year}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Rating</label>
                    <div className="relative">
                       <Star className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <input
                        name="rating"
                        type="number"
                        step="0.1"
                        value={formData.rating}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Quality</label>
                    <div className="relative">
                       <Film className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <input
                        name="quality"
                        value={formData.quality}
                        onChange={handleInputChange}
                        placeholder="1080p, 4K"
                        className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Audience</label>
                    <div className="relative">
                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                       <select
                        name="audience"
                        value={formData.audience}
                        onChange={handleInputChange}
                        className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-10 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all appearance-none"
                      >
                        <option value="">Standard</option>
                        <option value="family">Family</option>
                        <option value="adult">Adult</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Production Details */}
            <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Globe className="h-5 w-5 text-primary" />
                 <h3 className="text-lg font-bold text-foreground">Production Details</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Genres</label>
                  <input
                    name="genres"
                    value={formData.genres}
                    onChange={handleInputChange}
                    placeholder="Action, Drama, Sci-Fi"
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Director</label>
                  <input
                    name="director"
                    value={formData.director}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Language</label>
                  <input
                    name="language"
                    value={formData.language}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Runtime (min)</label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                    <input
                      name="runtime"
                      type="number"
                      value={formData.runtime}
                      onChange={handleInputChange}
                      className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Synopsis */}
            <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
              <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                 <Info className="h-5 w-5 text-primary" />
                 <h3 className="text-lg font-bold text-foreground">Synopsis</h3>
              </div>
              <textarea
                name="plot"
                rows={6}
                value={formData.plot}
                onChange={handleInputChange}
                placeholder="Brief description of the movie content..."
                className="w-full bg-background border border-border rounded-xl p-6 text-sm font-medium leading-relaxed text-foreground/80 focus:border-primary transition-all outline-none"
              />
            </div>

            {/* Subtitles */}
            <SubtitleManager movieId={movie.id} />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            <div className="p-6 bg-card border border-border rounded-2xl space-y-6 shadow-xl">
              <div className="aspect-poster relative bg-muted rounded-xl overflow-hidden shadow-inner group">
                 <Image
                  src={posterUrl}
                  alt="Preview"
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-1000 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/60 backdrop-blur-sm">
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
                  className="w-full h-10 bg-muted/30 border border-border rounded-lg px-4 text-[10px] font-mono text-primary/60 focus:border-primary outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                disabled={isScraping || isSubmitting}
                onClick={handleScrape}
                className="w-full h-14 bg-zinc-800 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isScraping ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Sparkles className="h-5 w-5" /> Scrape from TMDB</>}
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isScraping}
                className="w-full h-14 bg-primary text-primary-foreground text-sm font-bold rounded-2xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-5 w-5" /> Save Changes</>}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDelete}
                className="w-full h-14 border border-destructive/20 text-destructive/60 hover:text-destructive hover:bg-destructive/5 text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="h-5 w-5" /> Delete Movie
              </button>

              {status.msg && (
                <div className={`p-4 border text-xs font-bold flex items-center gap-3 rounded-xl animate-in fade-in slide-in-from-bottom-2 ${status.type === 'success' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                  <AlertCircle className="h-4 w-4" /> {status.msg}
                </div>
              )}
            </div>
            
            <div className="p-6 bg-muted/20 border border-border rounded-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                 <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Metadata Info</span>
                 <span className="text-[10px] font-mono text-primary/40">0x{movie.id.toString(16).toUpperCase()}</span>
              </div>
              <div className="space-y-2 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                 <p>Created: {new Date(movie.created_at).toLocaleDateString()}</p>
                 <p>Last Update: {new Date(movie.updated_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

        </div>
      </form>

      <FileBrowser 
        movieId={movie.id}
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onSelect={handlePosterSelect}
      />
    </>
  );
}
