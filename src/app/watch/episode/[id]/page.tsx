import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { MediaPlayer } from '@/features/movie/components/media-player';
import { ChevronLeft, ChevronRight, AlertCircle, Activity, SkipBack, SkipForward, LayoutList } from 'lucide-react';
import { getEpisodeContext } from '@/features/series/queries/get-episode-context';
import { b64urlEncode } from '@/lib/b64url';
import { EpisodePlaylist } from '@/features/series/components/episode-playlist';
import { EpisodeWatchLayout } from '@/features/series/components/episode-watch-layout';

interface WatchEpisodePageProps {
  params: Promise<{ id: string }>;
}

export default async function WatchEpisodePage({ params }: WatchEpisodePageProps) {
  const { id } = await params;
  const episodeId = parseInt(id);
  if (isNaN(episodeId)) notFound();

  const episodeData = getEpisodeContext(episodeId);
  if (!episodeData) notFound();

  const cookieStore = await cookies();
  const gateToken = cookieStore.get('mm_gate_token')?.value;

  if (episodeData && gateToken) {
    episodeData.source.src += `&t=${gateToken}`;
    if (episodeData.subtitles) {
      episodeData.subtitles = episodeData.subtitles.map((s: any) => ({
        ...s,
        src: s.src + `&t=${gateToken}`
      }));
    }
  }

  const { episode, playlist, nextEpisodeId, prevEpisodeId } = episodeData;

  return (
    <div className="min-h-screen bg-black text-foreground font-sans selection:bg-primary selection:text-white flex flex-col overflow-hidden h-screen">
      {/* Top Navigation Bar */}
      <div className="z-20 bg-black/80 backdrop-blur-md border-b border-white/5 sticky top-0 shrink-0">
        <div className="max-w-[1800px] mx-auto w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link 
              href={`/series/${episode.series_id || ''}`}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all group shrink-0"
              title={`Back to ${episode.series_title}`}
            >
              <ChevronLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
            </Link>
            
            <div className="min-w-0">
               <h2 className="text-sm font-black text-white leading-tight truncate uppercase tracking-tighter">{episode.series_title}</h2>
               <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                 S{episode.season_number}:E{episode.episode_number} {episode.title && !episode.title.toLowerCase().startsWith('episode ') ? `• ${episode.title}` : ''}
               </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {prevEpisodeId && (
              <Link 
                href={`/watch/episode/${prevEpisodeId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all group"
              >
                <SkipBack className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline">Prev</span>
              </Link>
            )}

            {nextEpisodeId && (
              <Link 
                href={`/watch/episode/${nextEpisodeId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all group shadow-[0_0_20px_rgba(var(--primary),0.3)]"
              >
                <span className="hidden sm:inline">Next</span>
                <SkipForward className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Player + Playlist Grid (Managed by Client Layout) */}
      <EpisodeWatchLayout playlist={playlist} currentEpisodeId={episode.id}>
        {/* Left Side Content */}
        <div className="flex-1 flex flex-col">
          {/* Player Section */}
          <section className="w-full bg-black aspect-video lg:aspect-auto lg:h-[calc(100vh-12rem)] relative group">
            {!episodeData.source ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 bg-muted/5">
                <Activity className="h-16 w-16 text-destructive mb-6 animate-pulse" />
                <h2 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Stream_Unavailable</h2>
                <p className="text-muted-foreground text-xs mt-2 max-w-xs font-bold uppercase tracking-widest opacity-50">Codec mismatch or file extraction failure.</p>
              </div>
            ) : (
              <MediaPlayer
                id={`episode_${episode.id}`}
                src={episodeData.source.src}
                mimeType={episodeData.mimeType}
                subtitles={episodeData.subtitles}
                title={`${episode.series_title} - S${episode.season_number}E${episode.episode_number} ${episode.title && !episode.title.toLowerCase().startsWith('episode ') ? `- ${episode.title}` : ''}`}
                className="w-full h-full"
              />
            )}
          </section>

          {/* Episode Info Panel */}
          <main className="w-full px-4 sm:px-6 py-8 lg:py-12 bg-zinc-950/20">
              <div className="max-w-4xl space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                       <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded border border-primary/20">
                          Now Playing
                       </span>
                       {episode.runtime && (
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                             {episode.runtime} Minutes
                          </span>
                       )}
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white leading-tight uppercase">
                        {episode.title || `Episode ${episode.episode_number}`}
                    </h1>
                  </div>

                  {episode.plot ? (
                      <p className="text-base md:text-lg leading-relaxed text-white/70 font-medium">
                          {episode.plot}
                      </p>
                  ) : (
                      <div className="space-y-3 opacity-20 max-w-xl">
                         <div className="h-2 bg-muted-foreground rounded-full w-full" />
                         <div className="h-2 bg-muted-foreground rounded-full w-5/6" />
                         <div className="h-2 bg-muted-foreground rounded-full w-4/6" />
                      </div>
                  )}
              </div>
          </main>
        </div>
      </EpisodeWatchLayout>
    </div>
  );
}

export async function generateMetadata({ params }: WatchEpisodePageProps) {
  const { id } = await params;
  const episodeId = parseInt(id);
  if (isNaN(episodeId)) return { title: 'MirrorMessiah - Unavailable' };
  const episodeData = getEpisodeContext(episodeId);
  if (!episodeData) return { title: 'MirrorMessiah - Unavailable' };
  return {
    title: `${episodeData.episode.series_title} S${episodeData.episode.season_number}E${episodeData.episode.episode_number} | MirrorMessiah`,
    description: "Watch episode on MirrorMessiah",
  };
}
