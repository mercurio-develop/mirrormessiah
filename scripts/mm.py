#!/usr/bin/env python3
"""
mm — MirrorMessiah CLI

Commands:
  sync   <media_dir>        Scan directory for new movies, ingest + auto-scrape
  ingest <path>             Ingest a single movie folder or file
  scrape                    Scrape TMDB metadata for movies missing plot/rating
  status                    Show DB stats

Usage:
  python scripts/mm.py sync /media/movies
  python scripts/mm.py ingest "/media/movies/Inception (2010) [1080p]"
  python scripts/mm.py scrape
  python scripts/mm.py scrape --force
  python scripts/mm.py scrape --dry-run
  python scripts/mm.py status

Requires: pip install requests python-dotenv
"""

import argparse
import mimetypes
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / '.env')

API_KEY   = os.getenv('TMDB_API_KEY')
DB_PATH   = os.getenv('DB_PATH') or str(ROOT / 'media.db')
MEDIA_DIR = os.getenv('MEDIA_DIR') or '/media'
TMDB_BASE = 'https://api.themoviedb.org/3'
IMG_BASE  = 'https://image.tmdb.org/t/p/w500'
DELAY     = 0.25

VIDEO_EXT = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.webm', '.flv'}
SUB_EXT   = {'.srt', '.vtt', '.ass', '.ssa'}

# Folder naming pattern: "Title (Year) [Quality] [...]"
FOLDER_RE = re.compile(
    r'^(?P<title>.+?)\s*\((?P<year>\d{4})\)(?:\s*\[(?P<quality>[^\]]+)\])?',
    re.IGNORECASE,
)

SKIP_QUALITY = re.compile(r'2160p|4K|UHD', re.IGNORECASE)

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def open_db() -> sqlite3.Connection:
    if not Path(DB_PATH).exists():
        print(f'ERROR: DB not found: {DB_PATH}')
        sys.exit(1)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    _ensure_columns(db)
    return db


def _ensure_columns(db: sqlite3.Connection) -> None:
    existing = {row[1] for row in db.execute('PRAGMA table_info(movies)').fetchall()}
    needed = [
        ('plot', 'TEXT'), ('rating', 'REAL'), ('genres', 'TEXT'),
        ('director', 'TEXT'), ('language', 'TEXT'), ('runtime', 'INTEGER'),
        ('thumbnail', 'TEXT'), ('imdb_id', 'TEXT'), ('tmdb_id', 'INTEGER'),
        ('audience', 'TEXT'),
    ]
    for col, typ in needed:
        if col not in existing:
            db.execute(f'ALTER TABLE movies ADD COLUMN {col} {typ}')
    db.commit()


def get_library_id(db: sqlite3.Connection) -> int:
    row = db.execute('SELECT id FROM libraries LIMIT 1').fetchone()
    if row:
        return row['id']
    cur = db.execute("INSERT INTO libraries (name, root_path) VALUES ('Default', '/')")
    db.commit()
    return cur.lastrowid


# ---------------------------------------------------------------------------
# Path parsing
# ---------------------------------------------------------------------------
def parse_folder_name(name: str) -> dict:
    """Extract title, year, quality from YTS-style folder names."""
    m = FOLDER_RE.match(name)
    if not m:
        return {'title': name, 'year': None, 'quality': None}
    quality = m.group('quality') or None
    # Normalize quality tag: keep only the resolution part
    if quality:
        for token in quality.split(']')[0].split():
            if re.match(r'\d{3,4}p|2160p|4K|UHD|1080|720', token, re.I):
                quality = token
                break
    # Strip release group noise from title (REPACK, DUBBED, EXTENDED, REMUX, BLURAY etc.)
    title = re.sub(
        r'\s+(REPACK|DUBBED|EXTENDED|REMUX|BLURAY|PROPER|UNRATED|DC|THEATRICAL).*$',
        '', m.group('title').strip(), flags=re.IGNORECASE
    ).strip()
    return {
        'title': title,
        'year': int(m.group('year')),
        'quality': quality,
    }


def find_video_files(folder: Path) -> list[Path]:
    return [p for p in folder.rglob('*') if p.suffix.lower() in VIDEO_EXT]


def find_subtitle_files(folder: Path) -> list[Path]:
    return [p for p in folder.rglob('*') if p.suffix.lower() in SUB_EXT]


def detect_lang_from_path(path: Path) -> str:
    """Detect language from filename patterns like .eng.srt, .spa.srt or parent dir."""
    name = path.stem.lower()
    lang3_map = {
        'eng': 'en', 'spa': 'es', 'fre': 'fr', 'ger': 'de',
        'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh',
    }
    # Try double-extension pattern: movie.eng.srt
    parts = name.split('.')
    if len(parts) >= 2 and parts[-1] in lang3_map:
        return lang3_map[parts[-1]]
    # Try parent dir or filename containing language name
    full = str(path).lower()
    for code, short in lang3_map.items():
        if code in full:
            return short
    return 'en'


# ---------------------------------------------------------------------------
# TMDB helpers
# ---------------------------------------------------------------------------
def tmdb_get(endpoint: str, **params) -> dict:
    if not API_KEY:
        raise RuntimeError('TMDB_API_KEY not set in .env')
    url = f'{TMDB_BASE}{endpoint}'
    params['api_key'] = API_KEY
    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def _clean(title: str) -> str:
    return re.sub(r'[^\w\s]', ' ', title).strip()


def tmdb_search(title: str, year: int | None) -> dict | None:
    for params in [
        {'query': title, 'year': year},
        {'query': title},
        {'query': _clean(title), 'year': year},
        {'query': _clean(title)},
    ]:
        if 'year' in params and not params.get('year'):
            continue
        filtered = {k: v for k, v in params.items() if v is not None}
        try:
            data = tmdb_get('/search/movie', **filtered)
            if data.get('results'):
                return data['results'][0]
        except Exception:
            pass
        time.sleep(DELAY)
    return None


def tmdb_details(tmdb_id: int) -> dict:
    return tmdb_get(f'/movie/{tmdb_id}', append_to_response='credits')


def download_poster(poster_path: str, dest: Path) -> bool:
    try:
        r = requests.get(f'{IMG_BASE}{poster_path}', timeout=15, stream=True)
        if not r.ok:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return True
    except Exception:
        return False


def scrape_one(db: sqlite3.Connection, movie: dict, dry_run: bool = False) -> str:
    try:
        tmdb_id = movie['tmdb_id']
        if not tmdb_id:
            result = tmdb_search(movie['title'], movie['year'])
            if not result:
                return 'not_found'
            tmdb_id = result['id']
            time.sleep(DELAY)

        details = tmdb_details(tmdb_id)
        genres  = ', '.join(g['name'] for g in details.get('genres', [])) or None
        crew    = details.get('credits', {}).get('crew', [])
        director = next((c['name'] for c in crew if c.get('job') == 'Director'), None)
        release  = details.get('release_date') or ''
        year     = int(release[:4]) if len(release) >= 4 else movie['year']

        audience = None
        genre_names = [g['name'] for g in details.get('genres', [])]
        if any(g in genre_names for g in ('Animation', 'Family')):
            audience = 'family'

        thumbnail = movie['thumbnail']
        if details.get('poster_path') and not dry_run:
            row = db.execute(
                'SELECT path FROM files WHERE movie_id = ? LIMIT 1', (movie['id'],)
            ).fetchone()
            if row:
                dest = Path(row['path']).parent / 'poster.jpg'
                if download_poster(details['poster_path'], dest):
                    thumbnail = str(dest)

        if not dry_run:
            db.execute(
                """UPDATE movies SET
                    tmdb_id=?, imdb_id=?, plot=?, rating=?, genres=?,
                    director=?, language=?, runtime=?, thumbnail=?,
                    audience=?, year=?, updated_at=datetime('now')
                   WHERE id=?""",
                (
                    tmdb_id, details.get('imdb_id') or movie['imdb_id'],
                    details.get('overview'), details.get('vote_average'),
                    genres, director, details.get('original_language'),
                    details.get('runtime'), thumbnail, audience, year, movie['id'],
                ),
            )
            db.commit()
        return 'ok'
    except Exception as e:
        print(f'  ERROR: {e}')
        return 'error'


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
def ingest_path(db: sqlite3.Connection, path: Path, library_id: int, auto_scrape: bool = True) -> bool:
    """Ingest a single movie folder or file. Returns True if newly added."""
    if path.is_file():
        folder = path.parent
        video_files = [path] if path.suffix.lower() in VIDEO_EXT else []
    else:
        folder = path
        video_files = find_video_files(folder)

    if not video_files:
        print(f'  No video files found in {folder.name}')
        return False

    # Skip folders that don't follow "Title (Year)" naming — prevents ingesting
    # TV shows, loose files dirs, or the media root itself
    if not FOLDER_RE.match(folder.name):
        print(f'  Skipping (no year): {folder.name}')
        return False

    # Skip 4K/2160p folders
    if SKIP_QUALITY.search(folder.name):
        print(f'  Skipping 4K: {folder.name}')
        return False

    meta = parse_folder_name(folder.name)

    # Check if already in DB by title+year+quality
    existing = db.execute(
        'SELECT id FROM movies WHERE LOWER(title)=LOWER(?) AND COALESCE(year,0)=COALESCE(?,0)',
        (meta['title'], meta['year']),
    ).fetchone()
    if existing:
        print(f'  Already in DB: {meta["title"]} ({meta["year"]})')
        return False

    # Insert movie row
    cur = db.execute(
        "INSERT INTO movies (title, year, quality) VALUES (?,?,?)",
        (meta['title'], meta['year'], meta['quality']),
    )
    movie_id = cur.lastrowid

    # Insert file rows
    for vf in video_files:
        size = vf.stat().st_size
        container = vf.suffix.lstrip('.')
        db.execute(
            "INSERT OR IGNORE INTO files (library_id, movie_id, path, size_bytes, container) VALUES (?,?,?,?,?)",
            (library_id, movie_id, str(vf), size, container),
        )

    # Insert subtitle rows
    for sf in find_subtitle_files(folder):
        lang = detect_lang_from_path(sf)
        fmt  = sf.suffix.lstrip('.')
        db.execute(
            "INSERT OR IGNORE INTO subtitles (movie_id, path, lang, format) VALUES (?,?,?,?)",
            (movie_id, str(sf), lang, fmt),
        )

    db.commit()
    print(f'  + Ingested: {meta["title"]} ({meta["year"]}) [{meta["quality"]}] — {len(video_files)} file(s)')

    # Auto-scrape metadata — only for movies without existing data
    if auto_scrape and API_KEY:
        movie_row = dict(db.execute('SELECT * FROM movies WHERE id=?', (movie_id,)).fetchone())
        if not movie_row.get('plot'):
            print(f'    Scraping TMDB…', end=' ', flush=True)
            result = scrape_one(db, movie_row)
            print(result)

    return True


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_sync(args):
    media_dir = Path(args.dir)
    if not media_dir.is_dir():
        print(f'ERROR: Not a directory: {media_dir}')
        sys.exit(1)

    db = open_db()
    library_id = get_library_id(db)

    # Each top-level subdirectory = one movie
    folders = sorted(p for p in media_dir.iterdir() if p.is_dir())
    print(f'Scanning {len(folders)} folders in {media_dir}\n')

    added = skipped = 0
    for folder in folders:
        result = ingest_path(db, folder, library_id, auto_scrape=not args.no_scrape)
        if result:
            added += 1
        else:
            skipped += 1

    db.close()
    print(f'\nDone. added={added}  skipped={skipped}')


def cmd_ingest(args):
    path = Path(args.path)
    if not path.exists():
        print(f'ERROR: Path not found: {path}')
        sys.exit(1)

    db = open_db()
    library_id = get_library_id(db)
    ingest_path(db, path, library_id, auto_scrape=not args.no_scrape)
    db.close()


def cmd_scrape(args):
    db = open_db()

    if args.force:
        query = 'SELECT * FROM movies ORDER BY title'
    else:
        query = 'SELECT * FROM movies WHERE plot IS NULL OR rating IS NULL ORDER BY title'

    movies = db.execute(query).fetchall()
    total  = len(movies)
    print(f'Scraping {total} movies  (force={args.force}, dry_run={args.dry_run})\n')

    ok = not_found = errors = 0
    for i, row in enumerate(movies, 1):
        m = dict(row)
        print(f'[{i}/{total}] {m["title"]} ({m["year"] or "?"}) … ', end='', flush=True)
        result = scrape_one(db, m, dry_run=args.dry_run)
        print(result)
        if result == 'ok':           ok += 1
        elif result == 'not_found':  not_found += 1
        else:                        errors += 1
        time.sleep(DELAY)

    db.close()
    print(f'\nDone. ok={ok}  not_found={not_found}  errors={errors}')


def cmd_clean_files(args):
    """Remove duplicate file rows, 4K file links, and orphaned file entries."""
    db = open_db()
    removed = 0

    # 1. Remove 4K/UHD file links (keep the movie row, just unlink the file)
    rows = db.execute("SELECT id, path FROM files WHERE path LIKE '%2160p%' OR path LIKE '%4K%' OR path LIKE '%UHD%'").fetchall()
    for row in rows:
        db.execute('DELETE FROM files WHERE id=?', (row[0],))
        print(f'  unlinked 4K: {Path(row[1]).name}')
        removed += 1

    # 2. Remove duplicate file rows (same movie_id + path, keep lowest id)
    dupe_rows = db.execute('''
        SELECT id FROM files WHERE id NOT IN (
            SELECT MIN(id) FROM files GROUP BY movie_id, path
        )
    ''').fetchall()
    for row in dupe_rows:
        db.execute('DELETE FROM files WHERE id=?', (row[0],))
        removed += 1
    if dupe_rows:
        print(f'  removed {len(dupe_rows)} duplicate file rows')

    # 3. Remove file rows pointing to missing paths
    all_files = db.execute('SELECT id, path FROM files').fetchall()
    missing = [(id, p) for id, p in all_files if not Path(p).exists()]
    for id, p in missing:
        db.execute('DELETE FROM files WHERE id=?', (id,))
        print(f'  removed missing: {Path(p).name}')
        removed += 1

    db.commit()
    db.close()
    print(f'\nDone. {removed} file rows removed.')


def cmd_status(args):
    db = open_db()
    stats = {
        'movies':          db.execute('SELECT COUNT(*) FROM movies').fetchone()[0],
        'with_metadata':   db.execute('SELECT COUNT(*) FROM movies WHERE plot IS NOT NULL').fetchone()[0],
        'missing_metadata':db.execute('SELECT COUNT(*) FROM movies WHERE plot IS NULL OR rating IS NULL').fetchone()[0],
        'files':           db.execute('SELECT COUNT(*) FROM files').fetchone()[0],
        'subtitles':       db.execute('SELECT COUNT(*) FROM subtitles').fetchone()[0],
    }
    db.close()
    print('\n  MirrorMessiah — DB Status')
    print(f'  {"─"*30}')
    for k, v in stats.items():
        print(f'  {k:<20} {v}')
    print()


# ---------------------------------------------------------------------------
# OpenSubtitles helpers
# ---------------------------------------------------------------------------
OPENSUBS_BASE = 'https://api.opensubtitles.com/api/v1'
OPENSUBS_KEY  = os.getenv('OPENSUBS_API_KEY', '')
OPENSUBS_UA   = 'MirrorMessiah v1.0'

_opensubs_token: str | None = None


def opensubs_login() -> str:
    global _opensubs_token
    if _opensubs_token:
        return _opensubs_token
    user = os.getenv('OPENSUBS_USERNAME', '')
    pwd  = os.getenv('OPENSUBS_PASSWORD', '')
    if not user or not pwd:
        raise RuntimeError('OPENSUBS_USERNAME and OPENSUBS_PASSWORD must be set in .env')
    if not OPENSUBS_KEY:
        raise RuntimeError('OPENSUBS_API_KEY must be set in .env')
    r = requests.post(
        f'{OPENSUBS_BASE}/login',
        json={'username': user, 'password': pwd},
        headers={'Api-Key': OPENSUBS_KEY, 'User-Agent': OPENSUBS_UA, 'Content-Type': 'application/json'},
        timeout=10,
    )
    r.raise_for_status()
    _opensubs_token = r.json()['token']
    return _opensubs_token


def _opensubs_headers(token: str) -> dict:
    return {
        'Api-Key': OPENSUBS_KEY,
        'Authorization': f'Bearer {token}',
        'User-Agent': OPENSUBS_UA,
    }


def opensubs_search(imdb_id: str, lang: str, token: str) -> list[dict]:
    """Search subtitles by IMDB ID and language code (e.g. 'en', 'es')."""
    # OpenSubtitles uses numeric IMDB ID without 'tt' prefix
    numeric_id = imdb_id.lstrip('t') if imdb_id else None
    if not numeric_id:
        return []
    r = requests.get(
        f'{OPENSUBS_BASE}/subtitles',
        params={'imdb_id': numeric_id, 'languages': lang, 'type': 'movie', 'order_by': 'download_count'},
        headers=_opensubs_headers(token),
        timeout=10,
    )
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return r.json().get('data', [])


def opensubs_get_download_url(file_id: int, token: str) -> str | None:
    r = requests.post(
        f'{OPENSUBS_BASE}/download',
        json={'file_id': file_id},
        headers={**_opensubs_headers(token), 'Content-Type': 'application/json'},
        timeout=10,
    )
    if r.status_code == 406:
        print('  ⚠ Download quota exceeded (free tier: 5/day)')
        return None
    r.raise_for_status()
    return r.json().get('link')


LANG3_FROM_2 = {'en': 'eng', 'es': 'spa', 'fr': 'fre', 'de': 'ger', 'pt': 'por', 'it': 'ita', 'ja': 'jpn'}
LANG_LABEL   = {'en': 'English', 'es': 'Español', 'fr': 'Français', 'de': 'Deutsch',
                'pt': 'Português', 'it': 'Italiano', 'ja': '日本語'}


def cmd_fetch_subs(args):
    langs: list[str] = [l.strip() for l in args.langs.split(',')]
    db = open_db()

    if args.movie_id:
        movies = db.execute(
            'SELECT id, title, year, imdb_id FROM movies WHERE id = ?', (args.movie_id,)
        ).fetchall()
    elif args.force:
        movies = db.execute('SELECT id, title, year, imdb_id FROM movies').fetchall()
    else:
        # Only movies that are missing at least one of the requested languages
        lang3s = [LANG3_FROM_2.get(l, l) for l in langs]
        placeholders = ','.join('?' * len(lang3s))
        movies = db.execute(f'''
            SELECT id, title, year, imdb_id FROM movies
            WHERE id NOT IN (
                SELECT DISTINCT movie_id FROM subtitles WHERE lang IN ({placeholders})
            )
        ''', lang3s).fetchall()

    print(f'\nfetch-subs: {len(movies)} movies to process, langs={langs}\n')
    if not movies:
        print('Nothing to do.')
        db.close()
        return

    try:
        token = opensubs_login()
    except Exception as e:
        print(f'Login failed: {e}')
        db.close()
        return

    total_added = 0

    for movie in movies:
        mid, title, year, imdb_id = movie['id'], movie['title'], movie['year'], movie['imdb_id']
        if not imdb_id:
            print(f'  SKIP {title} — no IMDB ID')
            continue

        # Determine save folder from existing files
        row = db.execute('SELECT path FROM files WHERE movie_id = ? LIMIT 1', (mid,)).fetchone()
        if not row:
            print(f'  SKIP {title} — no file path in DB')
            continue
        save_dir = Path(row['path']).parent

        print(f'  {title} ({year}) [{imdb_id}]')

        for lang in langs:
            lang3 = LANG3_FROM_2.get(lang, lang)
            label = LANG_LABEL.get(lang, lang.upper())

            # Skip if already present for this lang
            existing = db.execute(
                'SELECT id FROM subtitles WHERE movie_id = ? AND lang = ?', (mid, lang3)
            ).fetchone()
            if existing and not args.force:
                print(f'    [{lang}] already registered, skip')
                continue

            results = opensubs_search(imdb_id, lang, token)
            if not results:
                print(f'    [{lang}] no results')
                continue

            # Pick first result (already sorted by download_count)
            best = results[0]
            files = best.get('attributes', {}).get('files', [])
            if not files:
                print(f'    [{lang}] no file in result')
                continue

            file_id = files[0]['file_id']
            download_url = opensubs_get_download_url(file_id, token)
            if not download_url:
                break  # quota hit — stop all downloads

            # Download SRT content
            r = requests.get(download_url, timeout=30)
            r.raise_for_status()

            safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
            out_path = save_dir / f'{safe_title}.{lang}.srt'
            out_path.write_bytes(r.content)

            # Register in DB
            size = out_path.stat().st_size
            db.execute(
                'INSERT OR REPLACE INTO subtitles (movie_id, path, lang, label, format, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
                (mid, str(out_path), lang3, label, 'srt', size),
            )
            db.commit()
            total_added += 1
            print(f'    [{lang}] saved → {out_path.name}')
            time.sleep(1)  # be polite to the API

    db.close()
    print(f'\nDone. {total_added} subtitle(s) added.')


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        prog='mm',
        description='MirrorMessiah CLI — ingest, sync, scrape',
    )
    sub = parser.add_subparsers(dest='command', required=True)

    # sync
    p_sync = sub.add_parser('sync', help='Scan a directory and ingest new movies')
    p_sync.add_argument('dir', nargs='?', default=MEDIA_DIR, help=f'Path to media directory (default: {MEDIA_DIR})')
    p_sync.add_argument('--no-scrape', action='store_true', help='Skip TMDB scrape after ingest')

    # ingest
    p_ingest = sub.add_parser('ingest', help='Ingest a single movie folder or file')
    p_ingest.add_argument('path', nargs='?', default=MEDIA_DIR, help=f'Path to movie folder or video file (default: {MEDIA_DIR})')
    p_ingest.add_argument('--no-scrape', action='store_true', help='Skip TMDB scrape after ingest')

    # scrape
    p_scrape = sub.add_parser('scrape', help='Scrape TMDB metadata for movies missing data')
    p_scrape.add_argument('--force',   action='store_true', help='Re-scrape all movies')
    p_scrape.add_argument('--dry-run', action='store_true', help='Preview only, no writes')

    # fetch-subs
    p_fetch = sub.add_parser('fetch-subs', help='Download subtitles from OpenSubtitles')
    p_fetch.add_argument('--langs',     default='en,es', help='Comma-separated lang codes (default: en,es)')
    p_fetch.add_argument('--force',     action='store_true', help='Re-download even if already present')
    p_fetch.add_argument('--movie-id',  type=int, default=None, metavar='ID', help='Process a single movie by DB id')

    # clean-files
    sub.add_parser('clean-files', help='Remove duplicate file rows, 4K links, missing paths')

    # status
    sub.add_parser('status', help='Show DB statistics')

    args = parser.parse_args()

    dispatch = {
        'sync':        cmd_sync,
        'ingest':      cmd_ingest,
        'scrape':      cmd_scrape,
        'fetch-subs':  cmd_fetch_subs,
        'clean-files': cmd_clean_files,
        'status':      cmd_status,
    }
    dispatch[args.command](args)


if __name__ == '__main__':
    main()
