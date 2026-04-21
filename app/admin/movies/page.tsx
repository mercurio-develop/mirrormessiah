import Link from 'next/link';
import MoviesList from '@/components/MoviesList';
import { ChevronLeft, Plus } from 'lucide-react';
import { getMovies } from '@/features/movie/queries/get-movies';

export const dynamic = 'force-dynamic';

export default async function MoviesPage() {
  const { movies, total } = getMovies({ limit: 100});
  console.log('MoviesPage: ', movies);

  return (
    <div className="flex flex-col gap-12 font-mono">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-primary pl-6 py-2">
        <div className="space-y-2">
          <Link 
            href="/admin" 
            className="text-primary hover:text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Back_to_Control
          </Link>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white underline decoration-primary/30 underline-offset-8">Registry_Editor</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">Current_Treasury_Load: {total} entities</p>
        </div>

        <Link 
          href="/admin/movies/new"
          className="h-14 px-10 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        >
          <Plus className="h-4 w-4" /> Initialize_New_Entity
        </Link>
      </div>

      <div className="terminal-border p-px bg-white/5">
        <MoviesList initialMovies={movies} />
      </div>
    </div>
  );
}
