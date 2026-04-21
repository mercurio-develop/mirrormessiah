import { notFound } from 'next/navigation';
import Link from 'next/link';
import MediaPlayer from '@/components/MediaPlayer';
import HeroBackdrop from '@/components/HeroBackdrop';
import {ChevronLeft, Star, Calendar, Hash, Clock, Info, Activity, Globe, User, Edit, Sparkles, AlertCircle} from 'lucide-react';
import { getMovie } from '@/features/movie/queries/get-movie';
import { getMoviePlayback } from '@/features/movie/queries/get-movie-playback';
import { b64urlEncode } from '@/lib/b64url';
import Image from 'next/image';

interface WatchPageProps {
  params: Promise<{ id: string }>;
}

const getPosterUrl = (thumbnail: string | null | undefined): string | null => {
    if (!thumbnail) return null;
    if (thumbnail.startsWith('http')) return thumbnail;
    
    const [basePath, query] = thumbnail.split('?');
    let url = "/api/images?path=" + b64urlEncode(basePath);
    if (query) url += "&" + query;
    
    return url;
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
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white">
      {/* Immersive Background */}
      {posterUrl && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
          <HeroBackdrop src={posterUrl} alt={movie.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col pt-20">
        {/* Navigation / Back Button */}
        <div className="max-w-7xl mx-auto w-full px-6 py-6">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all group"
          >
            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Back to Movies</span>
          </Link>
        </div>

        {/* Player Section */}
        <section className="w-full max-w-7xl mx-auto px-6 mb-12">
          <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-white/5 relative">
            {!movieData ? (
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 border border-destructive/60 text-destructive text-[10px] font-black uppercase tracking-widest rounded-full backdrop-blur-sm pointer-events-none">
                <AlertCircle className="h-3 w-3" />
                No_Source
              </div>
            ) : movie.needs_repair ? (
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 border border-destructive/60 text-destructive text-[10px] font-black uppercase tracking-widest rounded-full backdrop-blur-sm pointer-events-none">
                <AlertCircle className="h-3 w-3" />
                Stream_Unstable
              </div>
            ) : null}
            {!movieData ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 bg-muted/10">
                <Activity className="h-16 w-16 text-destructive mb-6 animate-pulse" />
                <h2 className="text-3xl font-bold tracking-tight">Stream Unavailable</h2>
                <p className="text-muted-foreground text-sm mt-2 max-w-xs">The requested media format is not supported or the file is missing.</p>
              </div>
            ) : (
              <MediaPlayer
                id={movie.id}
                src={movieData.source.src}
                mimeType={movieData.mimeType}
                subtitles={movieData.subtitles}
                title={movie.title}
                className="w-full h-full"
              />
            )}
          </div>
        </section>

        {/* Content Details */}
        <main className="max-w-7xl mx-auto w-full px-6 pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
            <div className="lg:col-span-8 space-y-12">
              {/* Header Info */}
              <div className="space-y-6">
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
                  {movie.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-6 pt-2">
                  {movie.needs_repair ? (
                    <span className="px-3 py-1 bg-destructive/20 border border-destructive/40 text-destructive text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 animate-pulse">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Repair_Required
                    </span>
                  ) : null}
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <Star className="h-5 w-5 text-primary fill-primary" />
                    <span>{movie.rating || '0.0'}</span>
                  </div>
                  <div className="h-4 w-px bg-border/50" />
                  <span className="text-sm font-bold text-muted-foreground">{movie.year}</span>
                  <div className="h-4 w-px bg-border/50" />
                  <span className="text-sm font-bold text-muted-foreground">{movie.runtime ? movie.runtime + ' min' : 'N/A'}</span>
                  <div className="h-4 w-px bg-border/50" />
                  <span className="px-2 py-0.5 border border-muted-foreground/30 rounded text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                    {movie.quality || 'HDR'}
                  </span>
                  {movieData?.subtitles && movieData.subtitles.length > 0 && (
                    <>
                      <div className="h-4 w-px bg-border/50" />
                      <span className="px-1.5 py-0.5 border border-primary/20 bg-primary/10 rounded-sm text-[9px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1 shadow-sm">
                        <Sparkles className="h-2.5 w-2.5 fill-current" />
                        CC
                      </span>
                    </>
                  )}
                  {movie.audience && (
                    <>
                      <div className="h-4 w-px bg-border/50" />
                      <span className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1.5 shadow-lg ${movie.audience === 'family' ? 'bg-green-600' : 'bg-red-600'}`}>
                        <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        {movie.audience}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Synopsis */}
              {movie.plot && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Synopsis</h3>
                  <p className="text-lg md:text-xl leading-relaxed text-foreground/90 font-medium italic max-w-3xl">
                    {movie.plot}
                  </p>
                </div>
              )}

              {/* Secondary Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-border/50">
                <div className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4" /> Production Details
                  </h4>
                  <div className="space-y-4">
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Director</span>
                        <span className="text-sm font-bold flex items-center gap-2"><User className="h-3.5 w-3.5 opacity-40" /> {movie.director || 'Unknown'}</span>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Language</span>
                        <span className="text-sm font-bold flex items-center gap-2"><Globe className="h-3.5 w-3.5 opacity-40" /> {movie.language || 'English'}</span>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Genres</span>
                        <span className="text-sm font-bold text-primary">{movie.genres || 'Miscellaneous'}</span>
                     </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Technical Info
                  </h4>
                  <div className="space-y-4">
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Media Container</span>
                        <span className="text-sm font-mono font-bold">{movieData?.mimeType?.toUpperCase() || 'UNKNOWN'}</span>
                     </div>
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Database Identifiers</span>
                        <div className="flex items-center gap-4 text-xs font-mono opacity-60">
                           <span>IMDB: {movie.imdb_id || 'N/A'}</span>
                           <span>TMDB: {movie.tmdb_id || 'N/A'}</span>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar Poster */}
            <div className="lg:col-span-4 hidden lg:block">
              {posterUrl && (
                <div className="sticky top-32">
                   <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
                    <Image
                      src={posterUrl}
                      alt={movie.title}
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
                  </div>
                  <div className="mt-8">
                     <Link 
                        href={"/admin/movies/" + movie.id}
                        className="flex items-center justify-center gap-2 w-full py-4 bg-muted hover:bg-muted/80 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
                     >
                        <Edit className="h-4 w-4" /> Edit Entry
                     </Link>
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
  if (isNaN(movieId)) return { title: 'MirrorMessiah - Unavailable' };
  const movie = getMovie(movieId);
  if (!movie) return { title: 'MirrorMessiah - Unavailable' };
  return {
    title: movie.title + " | MirrorMessiah",
    description: movie.plot || "View details for " + movie.title,
  };
}
