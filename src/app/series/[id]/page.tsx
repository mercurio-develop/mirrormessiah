import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSeriesDetails } from '@/features/series/queries/get-series-details';
import HeroBackdrop from '@/components/HeroBackdrop';
import { b64urlEncode } from '@/lib/b64url';
import Image from 'next/image';
import { ChevronLeft, Star, Play, Info, User, Globe, AlertCircle, Sparkles } from 'lucide-react';
import SeasonSelector from '@/features/series/components/SeasonSelector';

interface SeriesDetailsPageProps {
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

export default async function SeriesDetailsPage({ params }: SeriesDetailsPageProps) {
  const { id } = await params;
  const seriesId = parseInt(id);
  if (isNaN(seriesId)) notFound();

  const series = getSeriesDetails(seriesId);
  if (!series) notFound();

  const posterUrl = getPosterUrl(series.thumbnail);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white pb-32">
      {posterUrl && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
          <HeroBackdrop src={posterUrl} alt={series.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col pt-20">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 lg:py-6">
          <Link 
            href="/series" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all group"
          >
            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Back to Series</span>
          </Link>
        </div>

        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 mb-12">
           <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
              {/* Poster */}
              {posterUrl && (
                 <div className="shrink-0 w-48 sm:w-64 lg:w-80 relative aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
                    <Image
                      src={posterUrl}
                      alt={series.title}
                      fill
                      unoptimized
                      priority
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
                 </div>
              )}

              <div className="space-y-6 flex-1">
                 <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight leading-tight">
                   {series.title}
                 </h1>

                 <div className="flex flex-nowrap items-center gap-4 sm:gap-6 pt-2 overflow-x-auto pb-4 scrollbar-hide shrink-0">
                  {series.needs_repair ? (
                    <span className="shrink-0 px-3 py-1 bg-destructive/20 border border-destructive/40 text-destructive text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 animate-pulse">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Repair_Required
                    </span>
                  ) : null}
                  <div className="shrink-0 flex items-center gap-1.5 text-sm font-bold">
                    <Star className="h-5 w-5 text-primary fill-primary" />
                    <span>{series.rating || '0.0'}</span>
                  </div>
                  <div className="shrink-0 h-4 w-px bg-border/50" />
                  <span className="shrink-0 text-sm font-bold text-muted-foreground">{series.year}</span>
                  <div className="shrink-0 h-4 w-px bg-border/50" />
                  <span className="shrink-0 px-2 py-0.5 border border-muted-foreground/30 rounded text-[10px] font-black uppercase tracking-tighter text-muted-foreground">
                    {series.seasons.length} Season{series.seasons.length !== 1 ? 's' : ''}
                  </span>
                  
                  {series.audience && (
                    <>
                      <div className="shrink-0 h-4 w-px bg-border/50" />
                      <span className={`shrink-0 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1.5 shadow-lg ${series.audience === 'family' ? 'bg-green-600' : 'bg-red-600'}`}>
                        <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        {series.audience}
                      </span>
                    </>
                  )}
                </div>

                {series.plot && (
                  <p className="text-base md:text-lg leading-relaxed text-foreground/90 font-medium max-w-3xl">
                    {series.plot}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 pt-4">
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/40">Genres</span>
                        <span className="text-sm font-bold text-primary">{series.genres || 'Miscellaneous'}</span>
                     </div>
                </div>
              </div>
           </div>
        </section>

        {/* Seasons & Episodes */}
        <section className="w-full max-w-7xl mx-auto px-4 sm:px-6">
           <SeasonSelector seasons={series.seasons} seriesId={series.id} />
        </section>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: SeriesDetailsPageProps) {
  const { id } = await params;
  const seriesId = parseInt(id);
  if (isNaN(seriesId)) return { title: 'MirrorMessiah - Unavailable' };
  const series = getSeriesDetails(seriesId);
  if (!series) return { title: 'MirrorMessiah - Unavailable' };
  return {
    title: series.title + " | MirrorMessiah",
    description: series.plot || "View details for " + series.title,
  };
}
