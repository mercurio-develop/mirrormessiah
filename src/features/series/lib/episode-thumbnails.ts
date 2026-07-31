import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { getSeasonDetails, getSeriesDetails, posterUrl } from '@/lib/tmdb';
import type { TmdbSeasonDetails } from '@/lib/tmdb';
import { discoverLocalArtwork, resolveSeriesDir } from '@/features/series/lib/local-artwork';
import { searchSeries } from '@/lib/tmdb';

type TmdbEpisode = TmdbSeasonDetails['episodes'][number];

export function episodeThumbPath(seriesDir: string, seasonNum: number, epNum: number): string {
  const sn = seasonNum.toString().padStart(2, '0');
  const en = epNum.toString().padStart(2, '0');
  return path.join(seriesDir, `Season ${sn}`, `S${sn}E${en}-thumb.jpg`);
}

export function thumbnailIsAvailable(
  thumbnail: string | null,
  seriesDir: string | null,
  seasonNum: number,
  epNum: number,
): boolean {
  if (thumbnail) {
    if (thumbnail.startsWith('http')) return true;
    if (fs.existsSync(thumbnail)) return true;
  }
  if (seriesDir && fs.existsSync(episodeThumbPath(seriesDir, seasonNum, epNum))) {
    return true;
  }
  return false;
}

export function computeAbsoluteEpisode(
  db: Database.Database,
  seriesId: number,
  seasonNum: number,
  epNum: number,
): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(max_ep), 0) AS total
    FROM (
      SELECT MAX(e.episode_number) AS max_ep
      FROM episodes e
      JOIN seasons s ON e.season_id = s.id
      WHERE s.series_id = ? AND s.season_number < ?
      GROUP BY s.season_number
    )
  `).get(seriesId, seasonNum) as { total: number };
  return (row.total || 0) + epNum;
}

export async function buildTmdbAbsoluteIndex(tmdbId: number): Promise<Map<number, TmdbEpisode>> {
  const index = new Map<number, TmdbEpisode>();
  const details = await getSeriesDetails(tmdbId);
  const seasons = (details.seasons || [])
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);

  let absNum = 0;
  for (const season of seasons) {
    const sDetails = await getSeasonDetails(tmdbId, season.season_number);
    for (const ep of sDetails.episodes) {
      absNum += 1;
      index.set(absNum, ep);
    }
  }
  return index;
}

export async function downloadEpisodeStill(stillPath: string, dest: string): Promise<boolean> {
  try {
    const imgRes = await fetch(posterUrl(stillPath));
    if (!imgRes.ok) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await imgRes.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

export interface ScrapeEpisodeThumbnailsResult {
  downloaded: number;
  skipped: number;
  failed: number;
  total: number;
}

export async function scrapeEpisodeThumbnailsForSeries(
  db: Database.Database,
  seriesId: number,
  options: { force?: boolean } = {},
): Promise<ScrapeEpisodeThumbnailsResult> {
  const force = options.force ?? false;
  const series = db.prepare('SELECT * FROM series WHERE id = ?').get(seriesId) as {
    id: number;
    title: string;
    year: number | null;
    tmdb_id: number | null;
    thumbnail: string | null;
  } | undefined;

  if (!series) {
    throw new Error('Series not found');
  }

  let tmdbId = series.tmdb_id;
  if (!tmdbId) {
    const result = await searchSeries(series.title, series.year);
    if (!result) {
      throw new Error('Not found on TMDB — set a TMDB ID first');
    }
    tmdbId = result.id;
    db.prepare('UPDATE series SET tmdb_id = ? WHERE id = ?').run(tmdbId, seriesId);
  }

  const seriesDir = resolveSeriesDir(db, seriesId);
  if (seriesDir) {
    discoverLocalArtwork(db, seriesId, seriesDir, series.thumbnail);
  }

  const absIndex = await buildTmdbAbsoluteIndex(tmdbId);
  const seasonCache = new Map<number, Map<number, TmdbEpisode>>();

  const episodes = db.prepare(`
    SELECT e.id, e.episode_number, e.thumbnail, s.season_number, s.id AS season_id
    FROM episodes e
    JOIN seasons s ON e.season_id = s.id
    WHERE s.series_id = ?
    ORDER BY s.season_number ASC, e.episode_number ASC
  `).all(seriesId) as {
    id: number;
    episode_number: number;
    thumbnail: string | null;
    season_number: number;
    season_id: number;
  }[];

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const ep of episodes) {
    const dest = seriesDir
      ? episodeThumbPath(seriesDir, ep.season_number, ep.episode_number)
      : null;

    if (!force && thumbnailIsAvailable(ep.thumbnail, seriesDir, ep.season_number, ep.episode_number)) {
      if (dest && fs.existsSync(dest) && ep.thumbnail !== dest) {
        db.prepare('UPDATE episodes SET thumbnail = ? WHERE id = ?').run(dest, ep.id);
      }
      skipped += 1;
      continue;
    }

    if (!seriesDir || !dest) {
      failed += 1;
      continue;
    }

    let tmdbEp: TmdbEpisode | undefined;
    if (!seasonCache.has(ep.season_number)) {
      try {
        const sDetails = await getSeasonDetails(tmdbId, ep.season_number);
        seasonCache.set(
          ep.season_number,
          new Map(sDetails.episodes.map((e) => [e.episode_number, e])),
        );
      } catch {
        seasonCache.set(ep.season_number, new Map());
      }
    }
    tmdbEp = seasonCache.get(ep.season_number)?.get(ep.episode_number);

    if (!tmdbEp?.still_path) {
      const absNum = computeAbsoluteEpisode(db, seriesId, ep.season_number, ep.episode_number);
      tmdbEp = absIndex.get(absNum);
    }

    if (!tmdbEp?.still_path) {
      failed += 1;
      continue;
    }

    const ok = await downloadEpisodeStill(tmdbEp.still_path, dest);
    if (ok) {
      db.prepare('UPDATE episodes SET thumbnail = ? WHERE id = ?').run(dest, ep.id);
      downloaded += 1;
    } else {
      failed += 1;
    }
  }

  return { downloaded, skipped, failed, total: episodes.length };
}
