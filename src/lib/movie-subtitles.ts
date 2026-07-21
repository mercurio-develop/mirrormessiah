import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { detectLangFromPath, labelFromSubtitlePath, SUBTITLE_EXTENSIONS } from '@/lib/subtitle-lang';

export function getMovieDirectories(db: Database.Database, movieId: number): string[] {
  const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
  const dirs = new Set<string>();
  for (const file of files) {
    dirs.add(path.dirname(file.path));
  }
  return [...dirs];
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

export function discoverMovieSubtitles(
  db: Database.Database,
  movieId: number,
): { path: string; lang: string | null; label: string | null; format: string | null }[] {
  const dirs = getMovieDirectories(db, movieId);
  const results: { path: string; lang: string | null; label: string | null; format: string | null }[] = [];

  for (const dir of dirs) {
    for (const subPath of walkSubtitleFiles(dir)) {
      const lang = detectLangFromPath(subPath);
      results.push({
        path: subPath,
        lang,
        label: labelFromSubtitlePath(subPath, lang),
        format: path.extname(subPath).slice(1),
      });
    }
  }

  return results;
}

export function movieHasSubtitles(db: Database.Database, movieId: number): boolean {
  const subs = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];
  if (subs.some((s) => fs.existsSync(s.path))) {
    return true;
  }
  return discoverMovieSubtitles(db, movieId).length > 0;
}

export function resyncMovieSubtitles(
  db: Database.Database,
  movieId: number,
): { found: number; added: number; removed: number } {
  const dirs = getMovieDirectories(db, movieId);
  if (dirs.length === 0) {
    return { found: 0, added: 0, removed: 0 };
  }

  let removed = 0;
  const existing = db.prepare('SELECT id, path FROM subtitles WHERE movie_id = ?').all(movieId) as {
    id: number;
    path: string;
  }[];

  for (const sub of existing) {
    if (!fs.existsSync(sub.path)) {
      db.prepare('DELETE FROM subtitles WHERE id = ?').run(sub.id);
      removed++;
    }
  }

  const allFiles = new Set<string>();
  for (const dir of dirs) {
    for (const subPath of walkSubtitleFiles(dir)) {
      allFiles.add(subPath);
    }
  }

  const remaining = db.prepare('SELECT path FROM subtitles WHERE movie_id = ?').all(movieId) as { path: string }[];
  const existingPaths = new Set(remaining.map((s) => s.path));

  let added = 0;
  for (const subPath of allFiles) {
    if (existingPaths.has(subPath)) continue;

    const lang = detectLangFromPath(subPath);
    const label = labelFromSubtitlePath(subPath, lang);
    const format = path.extname(subPath).slice(1);

    db.prepare(`
      INSERT INTO subtitles (movie_id, path, lang, label, format)
      VALUES (?, ?, ?, ?, ?)
    `).run(movieId, subPath, lang, label, format);
    added++;
  }

  return { found: allFiles.size, added, removed };
}

export function purgeOrphanMovieSubtitles(db: Database.Database): number {
  const result = db.prepare('DELETE FROM subtitles WHERE movie_id NOT IN (SELECT id FROM movies)').run();
  return result.changes;
}
