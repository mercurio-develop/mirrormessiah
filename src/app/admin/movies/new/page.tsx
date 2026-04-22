'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Save, Film, Tag, Globe, Info, Loader2, Sparkles, User, Clock, ChevronDown } from 'lucide-react';

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
    audience: '',
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
        console.error('Category_Fetch_Failure:', error);
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
        alert("Registration Failed: " + (error.error || 'Server error'));
      }
    } catch (error) {
      console.error('Sync failure:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-10 font-sans pb-32">
      <div className="flex flex-col gap-4 border-l-4 border-primary pl-6 py-1">
        <Link href="/admin/movies" className="text-primary hover:text-primary/80 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to Registry
        </Link>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground leading-none uppercase italic">Register Movie</h1>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">System Registry // New Entry</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-8">
          {/* Identity Section */}
          <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
            <div className="flex items-center gap-3 pb-2 border-b border-border/50">
               <Film className="h-5 w-5 text-primary" />
               <h3 className="text-lg font-bold text-foreground">Basic Information</h3>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Movie Title *</label>
                <input
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter the full movie title..."
                  className="w-full h-14 bg-background border border-border rounded-xl px-6 text-base font-semibold focus:border-primary transition-all text-foreground outline-none focus:ring-4 focus:ring-primary/5"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Release Year</label>
                  <input
                    name="year"
                    type="number"
                    value={formData.year}
                    onChange={handleInputChange}
                    placeholder="YYYY"
                    className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Target Audience</label>
                  <div className="relative">
                    <select
                      name="audience"
                      value={formData.audience}
                      onChange={handleInputChange}
                      className="w-full h-12 bg-background border border-border rounded-xl px-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all appearance-none"
                    >
                      <option value="">Standard</option>
                      <option value="family">Family</option>
                      <option value="adult">Adult</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Resolution</label>
                  <div className="relative">
                    <select
                      name="quality"
                      value={formData.quality}
                      onChange={handleInputChange}
                      className="w-full h-12 bg-background border border-border rounded-xl px-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all appearance-none"
                    >
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD</option>
                      <option value="4K">2160p 4K</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata Section */}
          <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm">
            <div className="flex items-center gap-3 pb-2 border-b border-border/50">
               <Globe className="h-5 w-5 text-primary" />
               <h3 className="text-lg font-bold text-foreground">Extended Metadata</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Director</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <input
                    name="director"
                    value={formData.director}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Language</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <input
                    name="language"
                    value={formData.language}
                    onChange={handleInputChange}
                    className="w-full h-12 bg-background border border-border rounded-xl pl-12 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                  />
                </div>
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
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">IMDB Identifier</label>
                <input
                  name="imdb_id"
                  value={formData.imdb_id}
                  onChange={handleInputChange}
                  placeholder="tt0000000"
                  className="w-full h-12 bg-background border border-border rounded-xl px-5 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Plot Section */}
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
              placeholder="Provide a brief overview of the movie content..."
              className="w-full bg-background border border-border rounded-xl p-6 text-sm font-medium leading-relaxed text-foreground/80 focus:border-primary outline-none transition-all"
            />
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Classification Sidebar */}
          <div className="p-8 bg-card border border-border rounded-2xl space-y-6 shadow-xl">
            <div className="flex items-center gap-3 border-b border-border/50 pb-4">
              <Tag className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Categories</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={formData.categories.includes(cat.name)}
                    onChange={(e) => handleCategoryChange(cat.name, e.target.checked)}
                    className="w-5 h-5 rounded-lg border border-border bg-background checked:bg-primary transition-all cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-primary text-primary-foreground font-extrabold uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 group disabled:opacity-50 rounded-2xl"
          >
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Save className="h-6 w-6" /> Save Movie</>}
          </button>

          <div className="p-6 bg-muted/20 border border-border rounded-2xl text-center">
             <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                New Database Index
             </p>
          </div>
        </div>
      </form>
    </div>
  );
}
