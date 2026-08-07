'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { b64urlEncode } from '@/lib/b64url';
import { Clock, Play, RotateCcw } from 'lucide-react';
import { HistoryCarouselRow } from '@/components/history-carousel-row';
import {
  episodePlaybackKey,
  formatProgressLabel,
  getPlaybackProgressSeconds,
} from '@/lib/playback-progress';
import {
  getRecentSeriesEpisodes,
  SERIES_LIBRARY_EVENT,
  type SeriesHistoryEntry,
} from '@/features/series/lib/series-library';

export interface EpisodeHistoryItem {
  id: number;
  title: string | null;
  episode_number: number;
  thumbnail: string | null;
  season_number: number;
  series_id: number;
  series_title: string;
}

const getPosterUrl = (thumbnail: string | null | undefined): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
};

function ContinueCard({
  entry,
  episode,
}: {
  entry: SeriesHistoryEntry;
  episode?: EpisodeHistoryItem;
}) {
  const thumbnail = episode?.thumbnail ?? entry.thumbnail;
  const seriesTitle = episode?.series_title ?? entry.seriesTitle;
  const episodeTitle = episode?.title ?? entry.episodeTitle;
  const seasonNumber = episode?.season_number ?? entry.seasonNumber;
  const episodeNumber = episode?.episode_number ?? entry.episodeNumber;
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  useEffect(() => {
    setProgressLabel(formatProgressLabel(getPlaybackProgressSeconds(episodePlaybackKey(entry.episodeId))));
  }, [entry.episodeId]);

  return (
    <Link
      href={`/watch/episode/${entry.episodeId}`}
      className="group snap-start shrink-0 w-56 sm:w-64 space-y-3"
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 shadow-lg group-hover:scale-[1.02] transition-transform">
        <Image src={getPosterUrl(thumbnail)} alt={seriesTitle} fill unoptimized className="object-cover" />
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center">
            <Play className="h-5 w-5 fill-current ml-0.5" />
          </div>
        </div>
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 text-[9px] font-bold uppercase tracking-wider text-white flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Continue
        </span>
        {progressLabel ? (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-white">
            {progressLabel}
          </span>
        ) : null}
      </div>
      <div>
        <h3 className="text-sm font-bold line-clamp-2 group-hover:text-primary transition-colors">{seriesTitle}</h3>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1 line-clamp-1">
          S{seasonNumber} · E{episodeNumber}
          {episodeTitle ? ` · ${episodeTitle}` : ''}
        </p>
      </div>
    </Link>
  );
}

export function SeriesHistoryCarousel() {
  const [history, setHistory] = useState<SeriesHistoryEntry[]>([]);
  const [episodeMap, setEpisodeMap] = useState<Record<number, EpisodeHistoryItem>>({});

  const refresh = useCallback(async () => {
    const recent = getRecentSeriesEpisodes();
    setHistory(recent);

    const ids = recent.map((item) => item.episodeId);
    if (ids.length === 0) {
      setEpisodeMap({});
      return;
    }

    try {
      const res = await fetch(`/api/episodes?ids=${ids.join(',')}`);
      const data = await res.json();
      const episodes = (data.episodes || []) as EpisodeHistoryItem[];
      setEpisodeMap(Object.fromEntries(episodes.map((episode) => [episode.id, episode])));
    } catch {
      setEpisodeMap({});
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(SERIES_LIBRARY_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(SERIES_LIBRARY_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  if (history.length === 0) return null;

  return (
    <HistoryCarouselRow
      title="Continue Watching"
      icon={<Clock className="h-4 w-4 text-primary" />}
    >
      {history.map((entry) => (
        <ContinueCard key={entry.episodeId} entry={entry} episode={episodeMap[entry.episodeId]} />
      ))}
    </HistoryCarouselRow>
  );
}
