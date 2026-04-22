import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { searchMovie, getMovieDetails, posterUrl, extractDirector } from '@/lib/tmdb';
import fs from 'fs';
import path from 'path';

export const POST = withAdminAuth(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const movieId = parseInt(id);
  const db = getDb();

  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId) as any;
  if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 });

  try {
    // Resolve TMDB ID
    let tmdbId: number = movie.tmdb_id;
    if (!tmdbId) {
      const result = await searchMovie(movie.title, movie.year);
      if (!result) return NextResponse.json({ error: 'Not found on TMDB' }, { status: 404 });
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

    return NextResponse.json({ success: true, tmdb_id: tmdbId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
