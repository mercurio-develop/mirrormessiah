import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { detectLangFromPath, labelFromSubtitlePath, SUBTITLE_EXTENSIONS } from '@/lib/subtitle-lang';

const EPISODE_RE = /S0*(\d+)\s*E0*(\d+)|(\d+)x(\d+)/i;

export function parseEpisodeNumbersFromName(name: string): { season: number; episode: number } | null {
  const match = name.match(EPISODE_RE);
  if (!match) return null;
  const season = parseInt(match[1] || match[3], 10);
  const episode = parseInt(match[2] || match[4], 10);
  if (Number.isNaN(season) || Number.isNaN(episode)) return null;
  return { season, episode };
}

export function subtitleMatchesEpisode(
  filePath: string,
  seasonNumber: number,
  episodeNumber: number,
): boolean {
  const base = path.basename(filePath);
  const parsed = parseEpisodeNumbersFromName(base);
  if (parsed) {
    return parsed.season === seasonNumber && parsed.episode === episodeNumber;
  }

  return false;
}

function walkSubtitleFiles(dir: string): string[] {
  const found: string[] = [];
  if (!fs.existsSync(dir)) return found;

  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current)) {
      const fullPath = path.join(current, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (SUBTITLE_EXTENSIONS.includes(path.extname(entry).toLowerCase())) {
        found.push(fullPath);
      }
    }
  };

  walk(dir);
  return found;
}

export function discoverEpisodeSubtitles(
  videoPath: string,
  seasonNumber: number,
  episodeNumber: number,
): { path: string; lang: string | null; label: string | null; format: string | null }[] {
  const dir = path.dirname(videoPath);
  const videoStem = path.basename(videoPath, path.extname(videoPath));
  const results: { path: string; lang: string | null; label: string | null; format: string | null }[] = [];

  for (const subPath of walkSubtitleFiles(dir)) {
    const base = path.basename(subPath, path.extname(subPath));
    const matchesEpisode = subtitleMatchesEpisode(subPath, seasonNumber, episodeNumber);
    const matchesStem = base === videoStem
      || base.startsWith(`${videoStem}.`)
      || base.startsWith(`${videoStem}-`);

    if (!matchesEpisode && !matchesStem) continue;

    const lang = detectLangFromPath(subPath);
    results.push({
      path: subPath,
      lang,
      label: labelFromSubtitlePath(subPath, lang),
      format: path.extname(subPath).slice(1),
    });
  }

  return results;
}

export function resyncEpisodeSubtitles(
  db: Database.Database,
  episodeId: number,
  seasonNumber: number,
  episodeNumber: number,
): { found: number; added: number; removed: number } {
  const files = db.prepare('SELECT path FROM episode_files WHERE episode_id = ?').all(episodeId) as { path: string }[];
  if (files.length === 0) {
    return { found: 0, added: 0, removed: 0 };
  }

  let removed = 0;
  const existing = db.prepare('SELECT id, path FROM episode_subtitles WHERE episode_id = ?').all(episodeId) as {
    id: number;
    path: string;
  }[];

  for (const sub of existing) {
    if (!fs.existsSync(sub.path)) {
      db.prepare('DELETE FROM episode_subtitles WHERE id = ?').run(sub.id);
      removed++;
    }
  }

  const matched = new Map<string, { path: string; lang: string; label: string; format: string }>();
  for (const file of files) {
    for (const sub of discoverEpisodeSubtitles(file.path, seasonNumber, episodeNumber)) {
      matched.set(sub.path, {
        path: sub.path,
        lang: sub.lang || 'en',
        label: sub.label || labelFromSubtitlePath(sub.path, sub.lang),
        format: sub.format || path.extname(sub.path).slice(1),
      });
    }
  }

  const remaining = db.prepare('SELECT path FROM episode_subtitles WHERE episode_id = ?').all(episodeId) as { path: string }[];
  const existingPaths = new Set(remaining.map((s) => s.path));

  let added = 0;
  for (const sub of matched.values()) {
    if (existingPaths.has(sub.path)) continue;
    db.prepare(`
      INSERT INTO episode_subtitles (episode_id, path, lang, label, format)
      VALUES (?, ?, ?, ?, ?)
    `).run(episodeId, sub.path, sub.lang, sub.label, sub.format);
    added++;
  }

  return { found: matched.size, added, removed };
}

export function resyncSeriesSubtitles(
  db: Database.Database,
  seriesId: number,
): { found: number; added: number; removed: number } {
  db.prepare('DELETE FROM episode_subtitles WHERE episode_id NOT IN (SELECT id FROM episodes)').run();

  const episodes = db.prepare(`
    SELECT e.id, s.season_number, e.episode_number
    FROM episodes e
    JOIN seasons s ON s.id = e.season_id
    WHERE s.series_id = ?
  `).all(seriesId) as { id: number; season_number: number; episode_number: number }[];

  let found = 0;
  let added = 0;
  let removed = 0;
  for (const ep of episodes) {
    const result = resyncEpisodeSubtitles(db, ep.id, ep.season_number, ep.episode_number);
    found += result.found;
    added += result.added;
    removed += result.removed;
  }

  return { found, added, removed };
}
