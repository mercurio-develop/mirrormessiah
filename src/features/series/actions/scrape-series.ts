'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { searchSeries, getSeriesDetails, getSeasonDetails, posterUrl, extractDirector } from '@/lib/tmdb';
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
    let seriesDir = '';
    if (details.poster_path) {
      const fileRow = db.prepare(`
        SELECT f.path FROM episode_files f 
        JOIN episodes e ON f.episode_id = e.id 
        JOIN seasons s ON e.season_id = s.id 
        WHERE s.series_id = ? LIMIT 1
      `).get(seriesId) as any;
      
      if (fileRow?.path) {
        seriesDir = path.dirname(path.dirname(fileRow.path)); // Assumes structure is Series/Season 01/S01E01.mp4
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

    // Scrape Seasons & Episodes
    const seasons = db.prepare('SELECT * FROM seasons WHERE series_id = ?').all(seriesId) as any[];
    for (const season of seasons) {
      try {
        const sDetails = await getSeasonDetails(tmdbId, season.season_number);
        if (!sDetails) continue;

        let seasonPosterPath: string | null = season.poster;
        if (sDetails.poster_path && seriesDir) {
           const seasonFolder = `Season ${season.season_number.toString().padStart(2, '0')}`;
           const dest = path.join(seriesDir, seasonFolder, 'poster.jpg');
           try {
             if (!fs.existsSync(dest)) {
                const imgRes = await fetch(posterUrl(sDetails.poster_path));
                if (imgRes.ok) {
                   fs.writeFileSync(dest, Buffer.from(await imgRes.arrayBuffer()));
                }
             }
             seasonPosterPath = dest;
           } catch (e) {}
        }
        
        db.prepare('UPDATE seasons SET title = ?, plot = ?, poster = ? WHERE id = ?').run(
          sDetails.name, sDetails.overview, seasonPosterPath, season.id
        );

        for (const ep of sDetails.episodes) {
           let epThumbPath: string | null = null;
           if (ep.still_path && seriesDir) {
              const seasonFolder = `Season ${season.season_number.toString().padStart(2, '0')}`;
              const thumbName = `S${season.season_number.toString().padStart(2, '0')}E${ep.episode_number.toString().padStart(2, '0')}-thumb.jpg`;
              const dest = path.join(seriesDir, seasonFolder, thumbName);
              try {
                if (!fs.existsSync(dest)) {
                   const imgRes = await fetch(posterUrl(ep.still_path));
                   if (imgRes.ok) {
                      fs.writeFileSync(dest, Buffer.from(await imgRes.arrayBuffer()));
                   }
                }
                epThumbPath = dest;
              } catch (e) {}
           }

           db.prepare(`
             UPDATE episodes 
             SET title = ?, plot = ?, runtime = ?, thumbnail = COALESCE(?, thumbnail)
             WHERE season_id = ? AND episode_number = ?
           `).run(ep.name, ep.overview, ep.runtime, epThumbPath, season.id, ep.episode_number);
           
           // Rename associated files and subtitles
           const epRow = db.prepare(`SELECT id FROM episodes WHERE season_id = ? AND episode_number = ?`).get(season.id, ep.episode_number) as any;
           if (epRow && ep.name && !ep.name.toLowerCase().startsWith('episode ')) {
             const cleanTitle = ep.name.replace(/[<>:"/\\|?*]/g, '_').trim();
             const titlePart = ` - ${cleanTitle}`;
             
             // Rename Media Files
             const files = db.prepare(`SELECT id, path FROM episode_files WHERE episode_id = ?`).all(epRow.id) as any[];
             for (const f of files) {
                if (fs.existsSync(f.path)) {
                   const parsed = path.parse(f.path);
                   const newName = `S${season.season_number.toString().padStart(2, '0')}E${ep.episode_number.toString().padStart(2, '0')}${titlePart}${parsed.ext}`;
                   const newPath = path.join(parsed.dir, newName);
                   
                   if (f.path !== newPath && !fs.existsSync(newPath)) {
                      try {
                        fs.renameSync(f.path, newPath);
                        db.prepare(`UPDATE episode_files SET path = ? WHERE id = ?`).run(newPath, f.id);
                      } catch (e) {}
                   }
                }
             }
             
             // Rename Subtitle Files
             const subs = db.prepare(`SELECT id, path FROM episode_subtitles WHERE episode_id = ?`).all(epRow.id) as any[];
             for (const s of subs) {
                 if (fs.existsSync(s.path)) {
                   const oldName = path.basename(s.path);
                   const parts = oldName.split('.');
                   let finalExt = `.${parts.pop()}`;
                   if (parts.length > 1 && parts[parts.length - 1].length <= 4) {
                      finalExt = `.${parts.pop()}${finalExt}`; // capture .en.srt
                   }
                   
                   const newName = `S${season.season_number.toString().padStart(2, '0')}E${ep.episode_number.toString().padStart(2, '0')}${titlePart}${finalExt}`;
                   const newPath = path.join(path.dirname(s.path), newName);
                   
                   if (s.path !== newPath && !fs.existsSync(newPath)) {
                      try {
                         fs.renameSync(s.path, newPath);
                         db.prepare(`UPDATE episode_subtitles SET path = ? WHERE id = ?`).run(newPath, s.id);
                      } catch (e) {}
                   }
                 }
             }
           }
        }
      } catch (e) {
        console.error(`Failed to scrape season ${season.season_number}`, e);
      }
    }

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
