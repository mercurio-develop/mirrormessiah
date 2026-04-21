'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Save, Film, Tag, Globe, Info, Loader2 } from 'lucide-react';

interface Category {
  id: number;
  name: string;
}

export default function NewMoviePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    year: '',
    quality: '1080p',
    imdb_id: '',
    tmdb_id: '',
    thumbnail: '',
    plot: '',
    director: '',
    language: 'English',
    runtime: '',
    categories: [] as string[],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories);
        }
      } catch (error) {
        console.error('Data acquisition failure:', error);
      }
    };
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (categoryName: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      categories: checked
        ? [...prev.categories, categoryName]
        : prev.categories.filter(c => c !== categoryName)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          year: formData.year ? parseInt(formData.year) : null,
          tmdb_id: formData.tmdb_id ? parseInt(formData.tmdb_id) : null,
          runtime: formData.runtime ? parseInt(formData.runtime) : null,
        })
      });

      if (response.ok) {
        router.push('/admin/movies');
        router.refresh();
      } else {
        const error = await response.json();
        alert("REJECTION: " + (error.error || 'Uplink failed'));
      }
    } catch (error) {
      console.error('Sync failure:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-12 font-mono pb-32">
      <div className="flex flex-col gap-4 border-l-4 border-primary pl-6 py-2">
        <Link href="/admin/movies" className="text-primary hover:text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors">
          <ChevronLeft className="h-3 w-3" /> Back_to_Registry
        </Link>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white leading-none">Initialize_Entity</h1>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">Sector: Registry_Uplink // Access_Level: Restricted</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-8">
          {/* Identity Section */}
          <div className="p-8 bg-black/40 border border-white/5 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
              <Film className="h-3 w-3" /> Core_Identity
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Title_Archive *</label>
                <input
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  placeholder="ARCHIVE_NAME_OR_CODE"
                  className="w-full h-14 bg-black/60 border border-white/5 px-6 text-sm font-bold uppercase tracking-widest focus:border-primary transition-all text-white placeholder:text-white/5"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Temporal_Year</label>
                  <input
                    name="year"
                    type="number"
                    value={formData.year}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Signal_Res</label>
                  <select
                    name="quality"
                    value={formData.quality}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                  >
                    <option value="1080p">1080P_FULL_HD</option>
                    <option value="720p">720P_HD</option>
                    <option value="4K">2160P_4K</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Spatial Section */}
          <div className="p-8 bg-black/40 border border-white/5 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
              <Globe className="h-3 w-3" /> Spatial_Metadata
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Director_Entity</label>
                <input
                  name="director"
                  value={formData.director}
                  onChange={handleInputChange}
                  className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Language_Stream</label>
                <input
                  name="language"
                  value={formData.language}
                  onChange={handleInputChange}
                  className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/20">Runtime_Minutes</label>
                <input
                  name="runtime"
                  type="number"
                  value={formData.runtime}
                  onChange={handleInputChange}
                  className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/20">IMDB_ID</label>
                <input
                  name="imdb_id"
                  value={formData.imdb_id}
                  onChange={handleInputChange}
                  placeholder="tt0000000"
                  className="w-full h-12 bg-black/60 border border-white/5 px-4 text-xs text-white focus:border-primary transition-all"
                />
              </div>
            </div>
          </div>

          {/* Plot Section */}
          <div className="p-8 bg-black/40 border border-white/5 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary flex items-center gap-2">
              <Info className="h-3 w-3" /> Intelligence_Briefing
            </h3>
            <textarea
              name="plot"
              rows={6}
              value={formData.plot}
              onChange={handleInputChange}
              className="w-full bg-black/60 border border-white/5 p-6 text-xs leading-relaxed text-white/60 focus:border-primary transition-all font-sans"
            />
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Classification Sidebar */}
          <div className="terminal-border p-8 bg-zinc-950/50 backdrop-blur-xl border-white/5 space-y-6">
            <div className="flex items-center gap-3">
              <Tag className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Classification</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.categories.includes(cat.name)}
                    onChange={(e) => handleCategoryChange(cat.name, e.target.checked)}
                    className="w-4 h-4 rounded-none border border-white/20 bg-black/40 checked:bg-primary transition-all cursor-pointer"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-primary text-primary-foreground font-black uppercase tracking-[0.3em] text-xs hover:bg-primary/90 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] flex items-center justify-center gap-3 group disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Save className="h-4 w-4" /> Finalize_Uplink</>}
          </button>
        </div>
      </form>
    </div>
  );
}
