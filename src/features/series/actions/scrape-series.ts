'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { searchSeries, getSeriesDetails, posterUrl, extractDirector } from '@/lib/tmdb';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

export async function scrapeSeriesAction(seriesId: number): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    const db = getDb();

    const series = db.prepare('SELECT * FROM series WHERE id = ?').get(seriesId) as any;
    if (!series) {
      return { status: 'error', message: 'Series not found' };
    }

    let tmdbId: number = series.tmdb_id;
    if (!tmdbId) {
      const result = await searchSeries(series.title, series.year);
      if (!result) {
        return { status: 'error', message: 'Not found on TMDB' };
      }
      tmdbId = result.id;
    }

    const details = await getSeriesDetails(tmdbId);

    let thumbnailPath: string | null = series.thumbnail;
    if (details.poster_path) {
      const fileRow = db.prepare(`
        SELECT f.path FROM episode_files f 
        JOIN episodes e ON f.episode_id = e.id 
        JOIN seasons s ON e.season_id = s.id 
        WHERE s.series_id = ? LIMIT 1
      `).get(seriesId) as any;
      
      if (fileRow?.path) {
        const seriesDir = path.dirname(path.dirname(fileRow.path)); // Assumes structure is Series/Season 01/S01E01.mp4
        const posterDest = path.join(seriesDir, 'poster.jpg');
        try {
          const imgRes = await fetch(posterUrl(details.poster_path));
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(posterDest, buf);
            thumbnailPath = posterDest;
          }
        } catch {
          // poster download failed
        }
      }
    }

    const genres = details.genres.map(g => g.name).join(', ') || null;
    const director = extractDirector(details);
    const year = details.first_air_date ? parseInt(details.first_air_date.slice(0, 4)) : series.year;

    let audience: string | null = null;
    if (details.genres.some(g => ['Animation', 'Family', 'Kids'].includes(g.name))) {
      audience = 'family';
    }

    db.prepare(`
      UPDATE series SET
        tmdb_id    = ?,
        plot       = ?,
        rating     = ?,
        genres     = ?,
        audience   = ?,
        director   = ?,
        language   = ?,
        thumbnail  = ?,
        year       = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tmdbId,
      details.overview,
      details.vote_average,
      genres,
      audience,
      director,
      details.original_language,
      thumbnailPath,
      year,
      seriesId,
    );

    revalidatePath(`/admin/series`);
    revalidatePath('/series');

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

export async function scrapeSeriesBulkAction(seriesIds: number[]): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    let successCount = 0;
    let failCount = 0;

    for (const seriesId of seriesIds) {
      try {
        const result = await scrapeSeriesAction(seriesId);
        if (result.status === 'success') {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }
    }

    return {
      status: 'success',
      message: `Batch scrape complete: ${successCount} successful, ${failCount} failed.`,
    };
  } catch (error: any) {
    return { status: 'error', message: error.message };
  }
}
