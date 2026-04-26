import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import MediaPlayer from '@/features/movie/components/MediaPlayer';
import { ChevronLeft, AlertCircle, Activity } from 'lucide-react';
import { getEpisodePlayback } from '@/features/series/queries/get-episode-playback';

interface WatchEpisodePageProps {
  params: Promise<{ id: string }>;
}

export default async function WatchEpisodePage({ params }: WatchEpisodePageProps) {
  const { id } = await params;
  const episodeId = parseInt(id);
  if (isNaN(episodeId)) notFound();

  const episodeData = getEpisodePlayback(episodeId);
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

  const { episode } = episodeData;

  return (
    <div className="min-h-screen bg-black text-foreground font-sans selection:bg-primary selection:text-white flex flex-col">
      <div className="relative z-10 flex flex-col pt-6 flex-1">
        {/* Navigation / Back Button */}
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link 
            href={`/series/${episode.series_id || ''}`} // We might need to pass series_id in the playback data
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all group"
          >
            <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Back to {episode.series_title}</span>
          </Link>

          <div className="text-right">
             <h2 className="text-lg font-bold text-white leading-tight">{episode.series_title}</h2>
             <p className="text-sm text-muted-foreground font-medium">Season {episode.season_number} Episode {episode.episode_number}</p>
          </div>
        </div>

        {/* Player Section */}
        <section className="w-full flex-1 flex flex-col max-w-7xl mx-auto px-4 sm:px-6 mb-8">
          <div className="w-full flex-1 bg-black rounded-xl overflow-hidden shadow-2xl border border-white/5 relative min-h-[50vh]">
            {!episodeData.source ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-12 bg-muted/10">
                <Activity className="h-16 w-16 text-destructive mb-6 animate-pulse" />
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Stream Unavailable</h2>
                <p className="text-muted-foreground text-sm mt-2 max-w-xs">The requested media format is not supported or the file is missing.</p>
              </div>
            ) : (
              <MediaPlayer
                id={episode.id}
                src={episodeData.source.src}
                mimeType={episodeData.mimeType}
                subtitles={episodeData.subtitles}
                title={`${episode.series_title} S${episode.season_number}E${episode.episode_number}`}
                className="w-full h-full"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: WatchEpisodePageProps) {
  const { id } = await params;
  const episodeId = parseInt(id);
  if (isNaN(episodeId)) return { title: 'MirrorMessiah - Unavailable' };
  const episodeData = getEpisodePlayback(episodeId);
  if (!episodeData) return { title: 'MirrorMessiah - Unavailable' };
  return {
    title: `${episodeData.episode.series_title} S${episodeData.episode.season_number}E${episodeData.episode.episode_number} | MirrorMessiah`,
    description: "Watch episode on MirrorMessiah",
  };
}
