export function getPlaybackProgressSeconds(storageKey: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return 0;
  const seconds = parseFloat(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function formatProgressLabel(seconds: number): string | null {
  if (seconds < 30) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}:${rem.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function moviePlaybackKey(movieId: number): string {
  return `mm_playback_time_${movieId}`;
}

export function episodePlaybackKey(episodeId: number): string {
  return `mm_playback_time_episode_${episodeId}`;
}
