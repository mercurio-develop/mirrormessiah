import Link from 'next/link';
import { MoviesList } from '@/features/movie/components/movies-list';
import { ChevronLeft, Plus, Film, List } from 'lucide-react';
import { getMovies } from '@/features/movie/queries/get-movies';

export const dynamic = 'force-dynamic';

export default async function MoviesPage() {
  const { movies, total } = getMovies({ limit: 100});

  return (
    <div className="flex flex-col gap-10 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <Link 
            href="/admin" 
            className="text-primary hover:text-primary/80 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="flex items-center gap-4">
             <div className="p-3 bg-primary/10 text-primary rounded-xl">
                <Film className="h-6 w-6" />
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Movie Registry</h1>
          </div>
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
             <List className="h-4 w-4 opacity-40" />
             Collection Size: <span className="text-foreground font-bold">{total} total movies</span>
          </p>
        </div>

        <Link 
          href="/admin/movies/new"
          className="h-14 px-8 bg-primary text-primary-foreground text-sm font-bold rounded-2xl flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
        >
          <Plus className="h-5 w-5" /> Register New Movie
        </Link>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm p-6">
        <MoviesList initialMovies={movies} />
      </div>
    </div>
  );
}
