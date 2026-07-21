import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

export function resolveSeriesDir(db: Database.Database, seriesId: number): string | null {
  const fileRow = db.prepare(`
    SELECT f.path FROM episode_files f
    JOIN episodes e ON f.episode_id = e.id
    JOIN seasons s ON e.season_id = s.id
    WHERE s.series_id = ? LIMIT 1
  `).get(seriesId) as { path: string } | undefined;

  if (fileRow?.path) {
    return path.dirname(path.dirname(fileRow.path));
  }
  return null;
}

export function resolveLocalSeriesThumbnail(
  seriesDir: string,
  db: Database.Database,
  seriesId: number,
): string | null {
  const seriesPoster = path.join(seriesDir, 'poster.jpg');
  if (fs.existsSync(seriesPoster)) {
    return seriesPoster;
  }

  const seasons = db.prepare(
    'SELECT season_number FROM seasons WHERE series_id = ? ORDER BY season_number ASC',
  ).all(seriesId) as { season_number: number }[];

  for (const season of seasons) {
    const seasonPoster = path.join(
      seriesDir,
      `Season ${season.season_number.toString().padStart(2, '0')}`,
      'poster.jpg',
    );
    if (fs.existsSync(seasonPoster)) {
      return seasonPoster;
    }
  }

  const episodes = db.prepare(`
    SELECT s.season_number, e.episode_number
    FROM episodes e
    JOIN seasons s ON e.season_id = s.id
    WHERE s.series_id = ?
    ORDER BY s.season_number ASC, e.episode_number ASC
  `).all(seriesId) as { season_number: number; episode_number: number }[];

  for (const ep of episodes) {
    const sn = ep.season_number.toString().padStart(2, '0');
    const en = ep.episode_number.toString().padStart(2, '0');
    const epThumb = path.join(seriesDir, `Season ${sn}`, `S${sn}E${en}-thumb.jpg`);
    if (fs.existsSync(epThumb)) {
      return epThumb;
    }
  }

  return null;
}

export function discoverLocalArtwork(
  db: Database.Database,
  seriesId: number,
  seriesDir: string,
  currentThumbnail: string | null,
): void {
  const seriesPoster = path.join(seriesDir, 'poster.jpg');
  if (fs.existsSync(seriesPoster)) {
    if (!currentThumbnail) {
      db.prepare('UPDATE series SET thumbnail = ? WHERE id = ?').run(seriesPoster, seriesId);
    }
  } else if (!currentThumbnail) {
    const fallback = resolveLocalSeriesThumbnail(seriesDir, db, seriesId);
    if (fallback) {
      db.prepare('UPDATE series SET thumbnail = ? WHERE id = ?').run(fallback, seriesId);
    }
  }

  const seasons = db.prepare(
    'SELECT id, season_number, poster FROM seasons WHERE series_id = ?',
  ).all(seriesId) as { id: number; season_number: number; poster: string | null }[];

  for (const season of seasons) {
    if (season.poster) continue;
    const seasonPoster = path.join(
      seriesDir,
      `Season ${season.season_number.toString().padStart(2, '0')}`,
      'poster.jpg',
    );
    if (fs.existsSync(seasonPoster)) {
      db.prepare('UPDATE seasons SET poster = ? WHERE id = ?').run(seasonPoster, season.id);
    }
  }

  const episodes = db.prepare(`
    SELECT e.id, s.season_number, e.episode_number, e.thumbnail
    FROM episodes e
    JOIN seasons s ON e.season_id = s.id
    WHERE s.series_id = ?
  `).all(seriesId) as {
    id: number;
    season_number: number;
    episode_number: number;
    thumbnail: string | null;
  }[];

  for (const ep of episodes) {
    if (ep.thumbnail) continue;
    const sn = ep.season_number.toString().padStart(2, '0');
    const en = ep.episode_number.toString().padStart(2, '0');
    const epThumb = path.join(seriesDir, `Season ${sn}`, `S${sn}E${en}-thumb.jpg`);
    if (fs.existsSync(epThumb)) {
      db.prepare('UPDATE episodes SET thumbnail = ? WHERE id = ?').run(epThumb, ep.id);
    }
  }
}
