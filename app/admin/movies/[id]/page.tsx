import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminMovieForm from '@/components/AdminMovieForm';
import { getMovie } from '@/features/movie/queries/get-movie';
import { ChevronLeft } from 'lucide-react';

interface MovieEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function MovieEditPage({ params }: MovieEditPageProps) {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) notFound();

  const movie = getMovie(movieId);
  if (!movie) notFound();

  return (
    <div className="flex flex-col gap-12 font-mono pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-primary pl-6 py-2">
        <div className="space-y-2">
          <Link 
            href="/admin/movies" 
            className="text-primary hover:text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Back_to_Registry
          </Link>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Entity_Editor</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">Registry_Node: 0x{movieId.toString(16).toUpperCase()} // {movie.title}</p>
        </div>
      </div>

      <div className="terminal-border p-8 bg-zinc-950/50 backdrop-blur-xl border-white/5">
        <AdminMovieForm movie={movie} />
      </div>
    </div>
  );
}
