#!/usr/bin/env python3
"""
Bulk TMDB metadata scraper.

Usage:
    python scripts/scrape_metadata.py            # skip movies with plot+rating
    python scripts/scrape_metadata.py --force    # re-scrape everything
    python scripts/scrape_metadata.py --dry-run  # preview only, no writes

Requires: pip install requests python-dotenv
"""

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / '.env')

API_KEY = os.getenv('TMDB_API_KEY')
BASE = 'https://api.themoviedb.org/3'
IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
DELAY = 0.25  # seconds between requests


def tmdb_get(endpoint: str, **params) -> dict:
    url = f'{BASE}{endpoint}'
    params['api_key'] = API_KEY
    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def search_movie(title: str, year: int | None) -> dict | None:
    params = {'query': title}
    if year:
        params['year'] = year
    data = tmdb_get('/search/movie', **params)
    results = data.get('results', [])
    return results[0] if results else None


def get_details(tmdb_id: int) -> dict:
    return tmdb_get(f'/movie/{tmdb_id}', append_to_response='credits')


def download_poster(poster_path: str, dest: Path) -> bool:
    try:
        r = requests.get(f'{IMAGE_BASE}{poster_path}', timeout=15, stream=True)
        if not r.ok:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return True
    except Exception:
        return False


def scrape_movie(db: sqlite3.Connection, movie: dict, dry_run: bool) -> str:
    try:
        tmdb_id = movie['tmdb_id']

        if not tmdb_id:
            result = search_movie(movie['title'], movie['year'])
            if not result:
                return 'not_found'
            tmdb_id = result['id']
            time.sleep(DELAY)

        details = get_details(tmdb_id)

        genres = ', '.join(g['name'] for g in details.get('genres', [])) or None
        crew = details.get('credits', {}).get('crew', [])
        director = next((c['name'] for c in crew if c.get('job') == 'Director'), None)
        release = details.get('release_date') or ''
        year = int(release[:4]) if len(release) >= 4 else movie['year']

        thumbnail = movie['thumbnail']
        if details.get('poster_path') and not dry_run:
            row = db.execute(
                'SELECT path FROM files WHERE movie_id = ? LIMIT 1', (movie['id'],)
            ).fetchone()
            if row:
                dest = Path(row[0]).parent / 'poster.jpg'
                if download_poster(details['poster_path'], dest):
                    thumbnail = str(dest)

        if not dry_run:
            db.execute(
                '''UPDATE movies SET
                    tmdb_id   = ?, imdb_id   = ?, plot      = ?,
                    rating    = ?, genres    = ?, director  = ?,
                    language  = ?, runtime   = ?, thumbnail = ?,
                    year      = ?, updated_at = datetime('now')
                   WHERE id = ?''',
                (
                    tmdb_id,
                    details.get('imdb_id') or movie['imdb_id'],
                    details.get('overview'),
                    details.get('vote_average'),
                    genres,
                    director,
                    details.get('original_language'),
                    details.get('runtime'),
                    thumbnail,
                    year,
                    movie['id'],
                ),
            )
            db.commit()

        return 'ok'

    except Exception as e:
        print(f'  ERROR: {e}')
        return 'error'


def main():
    parser = argparse.ArgumentParser(description='Scrape TMDB metadata for all movies')
    parser.add_argument('--force', action='store_true', help='Re-scrape movies that already have metadata')
    parser.add_argument('--dry-run', action='store_true', help='Preview only, no DB writes')
    args = parser.parse_args()

    if not API_KEY:
        print('ERROR: TMDB_API_KEY not set in .env')
        sys.exit(1)

    db_path = os.getenv('DB_PATH') or str(Path(__file__).parent.parent / 'media.db')
    if not Path(db_path).exists():
        print(f'ERROR: DB not found: {db_path}')
        sys.exit(1)

    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row

    if args.force:
        query = 'SELECT id, title, year, tmdb_id, imdb_id, thumbnail FROM movies ORDER BY title'
    else:
        query = 'SELECT id, title, year, tmdb_id, imdb_id, thumbnail FROM movies WHERE plot IS NULL OR rating IS NULL ORDER BY title'

    # Ensure all metadata columns exist before writing
    existing = {row[1] for row in db.execute('PRAGMA table_info(movies)').fetchall()}
    needed = [
        ('plot', 'TEXT'), ('rating', 'REAL'), ('genres', 'TEXT'),
        ('director', 'TEXT'), ('language', 'TEXT'), ('runtime', 'INTEGER'),
        ('thumbnail', 'TEXT'), ('imdb_id', 'TEXT'), ('tmdb_id', 'INTEGER'),
    ]
    for col, typ in needed:
        if col not in existing:
            db.execute(f'ALTER TABLE movies ADD COLUMN {col} {typ}')
            print(f'  migrated: added column {col}')
    db.commit()

    movies = db.execute(query).fetchall()
    total = len(movies)
    print(f'Scraping {total} movies  (force={args.force}, dry_run={args.dry_run})\n')

    ok = not_found = errors = 0

    for i, movie in enumerate(movies, 1):
        m = dict(movie)
        label = f'[{i}/{total}] {m["title"]} ({m["year"] or "?"}) … '
        print(label, end='', flush=True)

        result = scrape_movie(db, m, args.dry_run)
        print(result)

        if result == 'ok':
            ok += 1
        elif result == 'not_found':
            not_found += 1
        else:
            errors += 1

        time.sleep(DELAY)

    db.close()
    print(f'\nDone. ok={ok}  not_found={not_found}  errors={errors}')


if __name__ == '__main__':
    main()
