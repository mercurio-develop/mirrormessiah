import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSeriesDetails } from '@/features/series/queries/get-series-details';
import HeroBackdrop from '@/components/HeroBackdrop';
import { b64urlEncode } from '@/lib/b64url';
import Image from 'next/image';
import { ChevronLeft, Star, Play, Info, User, Globe, AlertCircle, Sparkles } from 'lucide-react';
import SeasonSelector from '@/features/series/components/SeasonSelector';

export const dynamic = 'force-dynamic';

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
  
  // Find the very first episode across all seasons to use for the main "Play" button
  let firstEpisodeId: number | null = null;
  let firstSeasonEpNumber = "";
  
  if (series.seasons && series.seasons.length > 0) {
     // Sort seasons to find season 1 (or lowest)
     const sortedSeasons = [...series.seasons].sort((a, b) => a.season_number - b.season_number);
     const firstSeason = sortedSeasons[0];
     
     if (firstSeason.episodes && firstSeason.episodes.length > 0) {
         // Sort episodes to find episode 1
         const sortedEps = [...firstSeason.episodes].sort((a, b) => a.episode_number - b.episode_number);
         firstEpisodeId = sortedEps[0].id;
         firstSeasonEpNumber = `S${firstSeason.season_number} E${sortedEps[0].episode_number}`;
     }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white pb-32">
      {/* Full-bleed Cinematic Hero Section */}
      <div className="relative w-full h-[65vh] sm:h-[70vh] lg:h-[70vh] flex items-end">
          {posterUrl && (
            <div className="absolute inset-0 z-0 bg-black overflow-hidden">
              {/* Blurred abstract background using the poster colors */}
              <Image 
                  src={posterUrl} 
                  alt={`${series.title} background`} 
                  fill 
                  priority 
                  unoptimized
                  className="object-cover opacity-30 blur-[100px] scale-125" 
              />
              
              {/* Desktop: Clearer, right-aligned image that isn't awkwardly cropped */}
              <div className="hidden lg:block absolute inset-0 z-0">
                <div className="absolute inset-y-0 right-0 w-1/2 max-w-4xl opacity-50 mix-blend-luminosity [mask-image:linear-gradient(to_right,transparent,black_20%)]">
                    <Image 
                        src={posterUrl} 
                        alt={series.title} 
                        fill 
                        priority 
                        unoptimized
                        className="object-cover object-[center_20%]" 
                    />
                </div>
              </div>

              {/* Mobile: Standard cover image, slightly top-aligned */}
              <div className="block lg:hidden absolute inset-0 z-0">
                 <Image 
                    src={posterUrl} 
                    alt={series.title} 
                    fill 
                    priority 
                    unoptimized
                    className="object-cover opacity-50 mix-blend-luminosity object-[center_20%]" 
                />
              </div>
              
              {/* Aggressive gradient to fade to black at the bottom for content overlay */}
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-background via-background/80 to-transparent" />
              {/* Side gradient for text readability on desktop */}
              <div className="absolute inset-0 z-10 bg-gradient-to-r from-background via-background/60 to-transparent lg:from-background lg:via-background/80 lg:to-transparent" />
            </div>
          )}

          {/* Navigation / Back Button (Overlay) */}
          <div className="absolute top-20 left-0 right-0 z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4">
            <Link 
              href="/series" 
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/40 border border-white/10 text-white hover:bg-white hover:text-black transition-all group backdrop-blur-md"
            >
              <ChevronLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12 lg:pb-24">
             <div className="max-w-3xl space-y-6">
                 {/* Title Treatment */}
                 <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white drop-shadow-2xl">
                   {series.title}
                 </h1>

                 {/* Metadata Row */}
                 <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm font-bold text-white/80 drop-shadow-md">
                  {series.needs_repair ? (
                    <span className="px-3 py-1 bg-destructive/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 animate-pulse shadow-lg">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Repair_Required
                    </span>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-green-500 fill-green-500" />
                    <span className="text-green-500">{series.rating || 'New'} Rating</span>
                  </div>
                  <span className="text-white">{series.year}</span>
                  <span className="px-1.5 py-0.5 border border-white/40 rounded text-xs">
                    {series.seasons.length} Season{series.seasons.length !== 1 ? 's' : ''}
                  </span>
                  
                  {series.audience && (
                    <span className={`px-2 py-0.5 rounded-sm border text-xs font-black uppercase tracking-widest ${series.audience === 'family' ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400'}`}>
                        {series.audience}
                    </span>
                  )}
                </div>

                {/* Synopsis */}
                {series.plot && (
                  <p className="text-base md:text-lg leading-relaxed text-white/90 font-medium max-w-2xl line-clamp-3 md:line-clamp-none drop-shadow-md">
                    {series.plot}
                  </p>
                )}
                
                {/* Secondary Meta */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm drop-shadow-md">
                     <div className="flex items-center gap-2">
                        <span className="text-white/50 font-medium">Genres:</span>
                        <span className="text-white font-semibold">{series.genres || 'TV Shows'}</span>
                     </div>
                </div>

                {/* Call to Action Actions */}
                <div className="flex items-center gap-4 pt-6">
                    {firstEpisodeId ? (
                        <Link 
                            href={`/watch/episode/${firstEpisodeId}`}
                            className="h-12 sm:h-14 px-8 sm:px-10 bg-white text-black text-sm sm:text-base font-bold rounded-lg flex items-center justify-center gap-3 hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-2xl"
                        >
                            <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current" /> Play {firstSeasonEpNumber}
                        </Link>
                    ) : (
                        <button disabled className="h-12 sm:h-14 px-8 sm:px-10 bg-white/20 text-white/50 text-sm sm:text-base font-bold rounded-lg flex items-center justify-center gap-3 cursor-not-allowed">
                           <AlertCircle className="h-5 w-5" /> No Episodes Indexed
                        </button>
                    )}
                </div>

             </div>
          </div>
      </div>

      {/* Main Content Area - Seasons & Episodes */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 mt-12 sm:mt-16">
           <SeasonSelector seasons={series.seasons} seriesId={series.id} />
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
