'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { searchMovie, getMovieDetails, posterUrl, extractDirector } from '@/lib/tmdb';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function scrapeMovieAction(movieId: number): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId) as any;
    if (!movie) {
      return { status: 'error', message: 'Movie not found' };
    }

    // Resolve TMDB ID
    let tmdbId: number = movie.tmdb_id;
    if (!tmdbId) {
      const result = await searchMovie(movie.title, movie.year);
      if (!result) {
        return { status: 'error', message: 'Not found on TMDB' };
      }
      tmdbId = result.id;
    }

    const details = await getMovieDetails(tmdbId);

    // Download poster if available and movie has a file path to anchor the dir
    let thumbnailPath: string | null = movie.thumbnail;
    if (details.poster_path) {
      const fileRow = db.prepare('SELECT path FROM files WHERE movie_id = ? LIMIT 1').get(movieId) as any;
      if (fileRow?.path) {
        const movieDir = path.dirname(fileRow.path);
        const posterDest = path.join(movieDir, 'poster.jpg');
        try {
          const imgRes = await fetch(posterUrl(details.poster_path));
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(posterDest, buf);
            thumbnailPath = posterDest;
          }
        } catch {
          // poster download failed — continue without it
        }
      }
    }

    const genres = details.genres.map(g => g.name).join(', ') || null;
    const director = extractDirector(details);
    const year = details.release_date ? parseInt(details.release_date.slice(0, 4)) : movie.year;

    // Auto-detect audience
    let audience: string | null = null;
    if (details.genres.some(g => ['Animation', 'Family'].includes(g.name))) {
      audience = 'family';
    }

    db.prepare(`
      UPDATE movies SET
        tmdb_id    = ?,
        imdb_id    = ?,
        plot       = ?,
        rating     = ?,
        genres     = ?,
        audience   = ?,
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
      audience,
      director,
      details.original_language,
      details.runtime,
      thumbnailPath,
      year,
      movieId,
    );

    revalidatePath(`/admin/movies/${movieId}`);
    revalidatePath('/admin/movies');
    revalidatePath('/');
    revalidatePath(`/watch/${movieId}`);

    return {
      status: 'success',
      message: 'Metadata synced from TMDB',
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: 'Scrape failed: ' + error.message };
  }
}
