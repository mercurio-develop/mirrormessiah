import { notFound } from 'next/navigation';
import Link from 'next/link';
import MediaPlayer from '@/components/MediaPlayer';
import HeroBackdrop from '@/components/HeroBackdrop';
import { ChevronLeft, Star, Calendar, Hash, Clock, Info, Activity } from 'lucide-react';
import { getMovie } from '@/features/movie/queries/get-movie';
import { getMoviePlayback } from '@/features/movie/queries/get-movie-playback';
import Image from 'next/image';

interface WatchPageProps {
  params: Promise<{ id: string }>;
}

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
    if (!thumbnail) return null;
    if (thumbnail.startsWith('http')) return thumbnail;
    const cleanPath = thumbnail.replace(/\/+/g, '/');
    return "/api/images?path=" + encodeURIComponent(cleanPath);
};

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) notFound();

  const movie = getMovie(movieId);
  if (!movie) notFound();

  const movieData = getMoviePlayback(movieId);
  const posterUrl = getPosterUrl(movie.thumbnail);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-primary selection:text-white">
      {posterUrl && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <HeroBackdrop src={posterUrl} alt={movie.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col">
        <section className="w-full bg-black shadow-2xl border-b border-white/5">
          <div className="aspect-video w-full max-h-[85vh] mx-auto bg-black relative">
            {!movieData ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 bg-[#0a0a0a]">
                <Activity className="h-16 w-16 text-destructive mb-6 animate-pulse" />
                <h2 className="text-3xl font-black uppercase italic tracking-tighter text-destructive">Signal_Lost</h2>
                <p className="text-white/40 text-sm mt-2 uppercase tracking-widest">Compliant media stream not detected_</p>
              </div>
            ) : (
              <MediaPlayer
                src={movieData.source.src}
                mimeType={movieData.mimeType}
                subtitles={movieData.subtitles}
                title={movie.title}
                className="w-full h-full"
              />
            )}
          </div>
        </section>

        <div className="max-w-7xl mx-auto w-full px-6 md:px-12 py-6 flex justify-between items-center">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-white/40 hover:text-primary transition-all group py-2"
          >
            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-black uppercase tracking-widest italic">Return_to_Registry</span>
          </Link>
          <Link 
            href={"/admin/movies/" + movie.id} 
            className="text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-all"
          >
            Edit_Registry_Entry
          </Link>
        </div>

        <main className="container max-w-7xl mx-auto px-6 md:px-12 pb-32 pt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-8 space-y-12">
              <div className="space-y-6">
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground leading-tight drop-shadow-[0_0_30px_rgba(139,92,246,0.15)]">
                  {movie.title}
                </h1>
                <div className="flex flex-wrap gap-4 pt-2">
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[11px] font-bold text-white/60">
                    <Calendar className="h-3.5 w-3.5" /> {movie.year}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[11px] font-bold text-white/60">
                    <Clock className="h-3.5 w-3.5" /> {movie.runtime ? movie.runtime + 'm' : 'Unknown'}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/30 rounded-md text-[11px] font-bold text-primary">
                    <Star className="h-3.5 w-3.5 fill-primary/20" /> {movie.rating || '?.?'}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-white text-black rounded-md text-[11px] font-bold">
                    <Hash className="h-3.5 w-3.5" /> {movie.quality || 'HDR'}
                  </div>
                </div>
              </div>

              {movie.plot && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-[2px] w-8 bg-primary/40" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/60">Registry_Entry_Summary</h3>
                  </div>
                  <p className="text-lg md:text-xl leading-relaxed text-white/80 font-medium italic border-l-4 border-primary/20 pl-8">
                    {movie.plot}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden backdrop-blur-md">
                <div className="p-8 bg-black/40 space-y-6">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                    <Info className="h-3.5 w-3.5" /> Identity_Parameters
                  </h4>
                  <div className="space-y-4 text-xs font-bold">
                     <div className="flex justify-between"><span className="text-white/20 font-medium">Director</span><span className="text-white/80">{movie.director || 'Anonymous'}</span></div>
                     <div className="flex justify-between"><span className="text-white/20 font-medium">Language</span><span className="text-white/80">{movie.language || 'English'}</span></div>
                     <div className="flex justify-between"><span className="text-white/20 font-medium">Genres</span><span className="text-primary/80">{movie.genres || 'Unassigned'}</span></div>
                  </div>
                </div>
                <div className="p-8 bg-black/40 space-y-6">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" /> Uplink_Metrics
                  </h4>
                  <div className="space-y-4 text-xs font-bold">
                     <div className="flex justify-between"><span className="text-white/20 font-medium">IMDB_ID</span><span className="text-white/80 tabular-nums">{movie.imdb_id || 'N/A'}</span></div>
                     <div className="flex justify-between"><span className="text-white/20 font-medium">TMDB_ID</span><span className="text-white/80 tabular-nums">{movie.tmdb_id || 'N/A'}</span></div>
                     <div className="flex justify-between"><span className="text-white/20 font-medium">Protocol</span><span className="text-white/80">{movieData?.mimeType?.split('/')[1].toUpperCase() || 'RAW'}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 hidden lg:block">
              {posterUrl && (
                <div className="sticky top-32">
                   <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
                    <Image
                      src={posterUrl}
                      alt={movie.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: WatchPageProps) {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) return { title: 'MirrorMessiah - Signal_Lost' };
  const movie = getMovie(movieId);
  if (!movie) return { title: 'MirrorMessiah - Signal_Lost' };
  return {
    title: movie.title + " // Archive_Entry",
    description: movie.plot || "Accessing registry entry " + movieId,
  };
}
