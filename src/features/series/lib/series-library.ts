export const SERIES_HISTORY_KEY = 'mm_series_history';
export const SERIES_LIBRARY_EVENT = 'mm-series-library-changed';

export interface SeriesHistoryEntry {
  episodeId: number;
  seriesId: number;
  seriesTitle: string;
  episodeTitle: string | null;
  seasonNumber: number;
  episodeNumber: number;
  thumbnail: string | null;
  watchedAt: number;
}

const MAX_HISTORY = 12;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(SERIES_LIBRARY_EVENT));
}

export function getSeriesHistory(): SeriesHistoryEntry[] {
  return readJson<SeriesHistoryEntry[]>(SERIES_HISTORY_KEY, []);
}

export function recordSeriesWatch(entry: Omit<SeriesHistoryEntry, 'watchedAt'>) {
  const now = Date.now();
  const next = [
    { ...entry, watchedAt: now },
    ...getSeriesHistory().filter((item) => item.episodeId !== entry.episodeId),
  ].slice(0, MAX_HISTORY);
  writeJson(SERIES_HISTORY_KEY, next);
}

export function getRecentSeriesEpisodes(limit = 8): SeriesHistoryEntry[] {
  return getSeriesHistory().slice(0, limit);
}
