'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Movie } from '@/lib/db';
import { Terminal, Save, Loader2, AlertCircle, Image as ImageIcon, Trash2, Cpu, Globe, Info, Search } from 'lucide-react';
import FileBrowser from './FileBrowser';

interface AdminMovieFormProps {
  movie: Movie;
}

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const cleanPath = thumbnail.replace(/\/+/g, '/');
  return "/api/images?path=" + encodeURIComponent(cleanPath) + "&public=true";
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
    thumbnail: movie.thumbnail || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
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
        setStatus({ type: 'success', msg: 'POSTER_RENAMED_AND_LINKED' });
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

      if (!response.ok) throw new Error('Override failed');

      setStatus({ type: 'success', msg: 'REGISTRY_ENTRY_SYNCHRONIZED' });
      setTimeout(() => router.push('/admin/movies'), 1000);
    } catch (err) {
      setStatus({ type: 'error', msg: 'UPLINK_FAILURE: DATA_REJECTED' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('CONFIRM_PURGE: Permanent archival deletion?')) return;

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
      <form onSubmit={handleSubmit} className="space-y-12 font-mono">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          <div className="lg:col-span-8 space-y-8">
            <div className="p-8 bg-card rounded-lg border border-border space-y-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
                <Terminal className="h-3 w-3" /> Core_Identity
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Title_Archive</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full h-14 bg-background border border-border rounded-md px-6 text-sm font-bold uppercase tracking-widest focus:border-primary transition-all text-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Temporal_Year</label>
                    <input
                      name="year"
                      type="number"
                      value={formData.year}
                      onChange={handleInputChange}
                      className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Signal_Quality</label>
                    <input
                      name="quality"
                      value={formData.quality}
                      onChange={handleInputChange}
                      className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-card rounded-lg border border-border space-y-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
                <Globe className="h-3 w-3" /> Spatial_Metadata
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Genres_Classification</label>
                  <input
                    name="genres"
                    value={formData.genres}
                    onChange={handleInputChange}
                    placeholder="Action, Sci-Fi, etc."
                    className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Director_Entity</label>
                  <input
                    name="director"
                    value={formData.director}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Language_Stream</label>
                  <input
                    name="language"
                    value={formData.language}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Runtime_Minutes</label>
                  <input
                    name="runtime"
                    type="number"
                    value={formData.runtime}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-md px-4 text-xs text-foreground focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="p-8 bg-card rounded-lg border border-border space-y-6 shadow-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
                <Info className="h-3 w-3" /> Intelligence_Briefing
              </h3>
              <textarea
                name="plot"
                rows={8}
                value={formData.plot}
                onChange={handleInputChange}
                className="w-full bg-background border border-border rounded-lg p-6 text-sm leading-relaxed text-foreground/80 focus:border-primary transition-all font-sans"
              />
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="terminal-border p-6 bg-card/50 backdrop-blur-xl border-border rounded-lg space-y-6">
              <div className="aspect-poster relative border border-border bg-background rounded-md overflow-hidden shadow-2xl group">
                 <Image
                  src={posterUrl}
                  alt="Preview"
                  fill
                  className="object-cover opacity-80 transition-all duration-1000 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-background/60">
                   <button 
                     type="button"
                     onClick={() => setIsBrowserOpen(true)}
                     className="px-6 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest shadow-2xl flex items-center gap-2 rounded-md"
                   >
                     <Search className="h-3 w-3" /> Browse_Posters
                   </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Art_Path_Override</label>
                <div className="flex gap-2">
                  <input
                    name="thumbnail"
                    value={formData.thumbnail}
                    onChange={handleInputChange}
                    className="flex-1 h-10 bg-background border border-border rounded-md px-4 text-[10px] text-primary/60 focus:border-primary transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 bg-primary text-primary-foreground text-xs font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-primary/90 transition-all shadow-[0_0_20px_hsl(var(--primary)/0.3)] disabled:opacity-50 rounded-lg"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Finalize_Override</>}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="w-full h-12 border border-destructive/20 text-destructive/60 text-[10px] font-black uppercase tracking-widest hover:bg-destructive hover:text-white transition-all flex items-center justify-center gap-2 rounded-md"
              >
                <Trash2 className="h-3 w-3" /> Purge_Entity
              </button>

              {status.msg && (
                <div className={"p-4 border text-[10px] font-black uppercase tracking-widest flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 rounded-md " + (status.type === 'success' ? 'bg-primary/5 border-primary text-primary' : 'bg-destructive/5 border-destructive text-destructive')}>
                  <AlertCircle className="h-4 w-4" /> {status.msg}
                </div>
              )}
            </div>
            
            <div className="p-6 border border-border bg-accent/5 rounded-lg space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Archival_Node_0x{movie.id.toString(16).toUpperCase()}</h4>
              <div className="space-y-2 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                 <p>Registration: {new Date(movie.created_at).toISOString()}</p>
                 <p>Last_Uplink: {new Date().toISOString()}</p>
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
