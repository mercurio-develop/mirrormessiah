/**
 * Bulk TMDB metadata scraper.
 * Run: npx tsx scripts/scrape-all-metadata.ts
 *
 * Skips movies that already have plot+rating filled.
 * Use --force to re-scrape everything.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const API_KEY = process.env.TMDB_API_KEY;
const FORCE = process.argv.includes('--force');
const DELAY_MS = 250; // stay well under TMDB rate limit (40 req/10s)

if (!API_KEY) {
  console.error('TMDB_API_KEY not set in .env');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'media.db');
if (!fs.existsSync(dbPath)) {
  console.error('DB not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

async function tmdbGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${endpoint} → ${res.status}`);
  return res.json();
}

async function downloadPoster(posterPath: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(`${IMAGE_BASE}${posterPath}`);
    if (!res.ok) return false;
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeMovie(movie: any): Promise<'ok' | 'not_found' | 'error'> {
  try {
    let tmdbId: number = movie.tmdb_id;

    if (!tmdbId) {
      const search = await tmdbGet<{ results: any[] }>('/search/movie', {
        query: movie.title,
        ...(movie.year ? { year: String(movie.year) } : {}),
      });
      if (!search.results.length) return 'not_found';
      tmdbId = search.results[0].id;
      await sleep(DELAY_MS);
    }

    const details = await tmdbGet<any>(`/movie/${tmdbId}`, {
      append_to_response: 'credits',
    });

    const genres = (details.genres as any[]).map((g: any) => g.name).join(', ') || null;
    const director = (details.credits?.crew as any[])?.find((c: any) => c.job === 'Director')?.name ?? null;
    const year = details.release_date ? parseInt(details.release_date.slice(0, 4)) : movie.year;

    let thumbnailPath: string | null = movie.thumbnail;
    if (details.poster_path) {
      const fileRow = db.prepare('SELECT path FROM files WHERE movie_id = ? LIMIT 1').get(movie.id) as any;
      if (fileRow?.path) {
        const posterDest = path.join(path.dirname(fileRow.path), 'poster.jpg');
        const downloaded = await downloadPoster(details.poster_path, posterDest);
        if (downloaded) thumbnailPath = posterDest;
      }
    }

    db.prepare(`
      UPDATE movies SET
        tmdb_id    = ?,
        imdb_id    = ?,
        plot       = ?,
        rating     = ?,
        genres     = ?,
        director   = ?,
        language   = ?,
        runtime    = ?,
        thumbnail  = ?,
        year       = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tmdbId,
      details.imdb_id ?? movie.imdb_id,
      details.overview,
      details.vote_average,
      genres,
      director,
      details.original_language,
      details.runtime,
      thumbnailPath,
      year,
      movie.id,
    );

    return 'ok';
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
    return 'error';
  }
}

async function main() {
  const query = FORCE
    ? 'SELECT id, title, year, tmdb_id, imdb_id, thumbnail FROM movies ORDER BY title'
    : 'SELECT id, title, year, tmdb_id, imdb_id, thumbnail FROM movies WHERE plot IS NULL OR rating IS NULL ORDER BY title';

  const movies = db.prepare(query).all() as any[];
  console.log(`Scraping ${movies.length} movies (force=${FORCE})\n`);

  let ok = 0, notFound = 0, errors = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    process.stdout.write(`[${i + 1}/${movies.length}] ${movie.title} (${movie.year ?? '?'}) … `);

    const result = await scrapeMovie(movie);
    console.log(result);

    if (result === 'ok') ok++;
    else if (result === 'not_found') notFound++;
    else errors++;

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ok=${ok} not_found=${notFound} errors=${errors}`);
  db.close();
}

main();
