'use client';

import { useEffect } from 'react';
import { recordSeriesWatch } from '@/features/series/lib/series-library';

interface EpisodeWatchTrackerProps {
  episodeId: number;
  seriesId: number;
  seriesTitle: string;
  episodeTitle: string | null;
  seasonNumber: number;
  episodeNumber: number;
  thumbnail: string | null;
}

export function EpisodeWatchTracker(props: EpisodeWatchTrackerProps) {
  useEffect(() => {
    recordSeriesWatch(props);
  }, [
    props.episodeId,
    props.seriesId,
    props.seriesTitle,
    props.episodeTitle,
    props.seasonNumber,
    props.episodeNumber,
    props.thumbnail,
  ]);

  return null;
}
