#!/usr/bin/env python3
"""
mm — MirrorMessiah CLI

Commands:
  sync   <media_dir>        Scan directory for new movies, ingest + auto-scrape
  ingest <path>             Ingest a single movie folder or file
  relink <path>             Re-link files for an existing movie entry
  scrape                    Scrape TMDB metadata for movies missing plot/rating
  fetch-subs                Download subtitles from OpenSubtitles
  organize                  Restructure file system folders to match database naming
  cleanup                   Identify and merge duplicate movie entries
  sync-assets               Link posters and verify 1080p MP4 compliance
  full                      Run ingest, cleanup, organize, sync-assets, and scrape
  reset                     Permanently delete the database
  clean-files               Remove duplicate file rows, 4K links, missing paths
  status                    Show DB stats

Usage:
  python scripts/mm.py sync /media/movies
  python scripts/mm.py full --root /media/movies
  python scripts/mm.py status

Requires: pip install requests python-dotenv beautifulsoup4
"""

import argparse
import mimetypes
import os
import re
import shutil
import sqlite3
import sys
import time
import subprocess
import json
from pathlib import Path

import requests
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from urllib.parse import quote

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

SKIP_QUALITY = re.compile(r'2160p|4K|UHD|BLURAY|BRRIP|BDRIP', re.IGNORECASE)

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def backup_db(args) -> None:
    if hasattr(args, 'no_backup') and args.no_backup:
        return
    if not Path(DB_PATH).exists():
        return
    
    bak_path = Path(DB_PATH).with_suffix('.db.bak')
    try:
        shutil.copy2(DB_PATH, bak_path)
        print(f'  [Backup] Registry snapshot created: {bak_path.name}')
    except Exception as e:
        print(f'  [Backup] WARNING: Failed to create snapshot: {e}')


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
        ('audience', 'TEXT'), ('needs_repair', 'INTEGER DEFAULT 0'),
        ('library_id', 'INTEGER REFERENCES libraries(id) ON DELETE CASCADE'),
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

def get_video_metadata(file_path: Path) -> dict | None:
    try:
        cmd = [
            'ffprobe', 
            '-v', 'quiet', 
            '-print_format', 'json', 
            '-show_streams', 
            '-show_format', 
            str(file_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        video_stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
        if not video_stream:
            return None
            
        width = int(video_stream.get('width', 0))
        height = int(video_stream.get('height', 0))
        
        if height >= 2160 or width >= 3840:
            quality = "4K"
        elif height >= 1080 or width >= 1920:
            quality = "1080p"
        elif height >= 720 or width >= 1280:
            quality = "720p"
        else:
            quality = f"{height}p"
            
        return {'height': height, 'width': width, 'quality': quality}
    except:
        return None

def clean_movie_name(name: str) -> str:
    """Surgically strip technical noise and empty shells to find the Pure Title."""
    if not name: return ""
    name = Path(name).stem
    
    tech_patterns = [
        r"\[.*?\]", r"\(.*?\)", 
        r"\d{4}p", r"\d{3}p", r"2160p", r"4k", r"bluray", r"web-dl", r"webrip", r"brrip", r"hdtv",
        r"x264", r"x265", r"hevc", r"aac", r"dts", r"dd5\.1", r"ddp5\.1", r"5\.1", r"5\s1", 
        r"ac3", r"yts", r"yify", r"remastered", r"extended", r"directors\.cut", r"10bit", 
        r"hdr", r"atmos", r"dv", r"dvdrip", r"v2", r"hdts", r"av1", r"multi", r"dual", 
        r"latino", r"subs", r"h\.\d{3}", r"h264", r"h265", r"WEB", r"AMZN", r"NF", r"DSNP"
    ]
    for pattern in tech_patterns:
        name = re.sub(rf"\b{pattern}\b", " ", name, flags=re.IGNORECASE)

    name = re.sub(r"\b(18|19|20|21)\d{2}\b", " ", name)
    name = name.replace(".", " ").replace("_", " ").replace("-", " ")
    name = re.sub(r"[\(\)\[\]]", " ", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def parse_folder_name(name: str) -> dict:
    """Extract title, year, quality from folder names."""
    m = FOLDER_RE.match(name)
    if m:
        quality = m.group('quality') or None
        if quality:
            for token in quality.split(']')[0].split():
                if re.match(r'\d{3,4}p|2160p|4K|UHD|1080|720', token, re.I):
                    quality = token
                    break
        
        return {
            'title': clean_movie_name(m.group('title')),
            'year': int(m.group('year')),
            'quality': quality,
        }
    
    year_match = re.search(r"\b(19|20)\d{2}\b", name)
    year = int(year_match.group()) if year_match else None
    title = clean_movie_name(name)
    if year:
        title = title.replace(str(year), "").strip()
    
    quality_match = re.search(r"\b(1080p|720p|4K|2160p)\b", name, re.IGNORECASE)
    quality = quality_match.group().upper() if quality_match else None

    return {'title': title, 'year': year, 'quality': quality}


def get_yts_metadata(title: str, year: int | None = None) -> dict | None:
    """Fallback scraper: Infiltrate YTS mirrors for metadata without API keys."""
    mirrors = ["https://yts.mx", "https://yts.rs", "https://yts.do"]
    search_terms = [f"{title} {year}" if year else title, title]
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
    for term in search_terms:
        for mirror in mirrors:
            try:
                r = requests.get(f"{mirror}/api/v2/list_movies.json", params={"query_term": term, "limit": 5}, timeout=10, headers=headers)
                res = r.json()
                if res.get("status") == "ok" and res.get("data", {}).get("movie_count", 0) > 0:
                    movies = res["data"]["movies"]
                    if year:
                        for m in movies:
                            if m.get("year") == year: return m
                    return movies[0]
            except Exception: continue
    return None

def find_video_files(folder: Path) -> list[Path]:
    return [p for p in folder.rglob('*') if p.suffix.lower() in VIDEO_EXT]

def find_subtitle_files(folder: Path) -> list[Path]:
    return [p for p in folder.rglob('*') if p.suffix.lower() in SUB_EXT]

def detect_lang_from_path(path: Path) -> str:
    name = path.stem.lower()
    lang3_map = {
        'eng': 'en', 'spa': 'es', 'fre': 'fr', 'ger': 'de',
        'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh',
    }
    parts = name.split('.')
    if len(parts) >= 2 and parts[-1] in lang3_map:
        return lang3_map[parts[-1]]
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
        details = None
        
        if API_KEY:
            if not tmdb_id:
                result = tmdb_search(movie['title'], movie['year'])
                if result:
                    tmdb_id = result['id']
                    time.sleep(DELAY)
            if tmdb_id:
                try:
                    details = tmdb_details(tmdb_id)
                except Exception: pass

        if not details:
            yts_meta = get_yts_metadata(movie['title'], movie['year'])
            if yts_meta:
                details = {
                    'imdb_id': yts_meta.get('imdb_code'),
                    'overview': yts_meta.get('description_full'),
                    'vote_average': yts_meta.get('rating'),
                    'genres': [{'name': g} for g in yts_meta.get('genres', [])],
                    'original_language': 'en',
                    'runtime': yts_meta.get('runtime'),
                    'poster_path': yts_meta.get('large_cover_image'),
                    'credits': {'crew': []}
                }
                print(f"    [YTS Fallback] Found data for {movie['title']}")

        if not details:
            return 'not_found'

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
        poster_src = details.get('poster_path')
        if poster_src and not dry_run:
            row = db.execute('SELECT path FROM files WHERE movie_id = ? LIMIT 1', (movie['id'],)).fetchone()
            if row:
                dest = Path(row['path']).parent / 'poster.jpg'
                if poster_src.startswith('http'):
                    try:
                        r = requests.get(poster_src, timeout=15, stream=True)
                        if r.ok:
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            with open(dest, 'wb') as f:
                                for chunk in r.iter_content(8192): f.write(chunk)
                            thumbnail = str(dest)
                    except: pass
                elif download_poster(poster_src, dest):
                    thumbnail = str(dest)

        if not dry_run:
            db.execute(
                """UPDATE movies SET
                    tmdb_id=?, imdb_id=?, plot=?, rating=?, genres=?,
                    director=?, language=?, runtime=?, thumbnail=?,
                    audience=?, year=?, updated_at=datetime('now')
                   WHERE id=?""",
                (
                    tmdb_id or movie['tmdb_id'], details.get('imdb_id') or movie['imdb_id'],
                    details.get('overview'), details.get('vote_average'),
                    genres, director, details.get('original_language'),
                    details.get('runtime'), thumbnail, audience, year, movie['id'],
                ),
            )
            
            # Sync to categories table for UI
            if audience == 'family':
                db.execute("INSERT OR IGNORE INTO categories (name) VALUES ('Family')")
                cat_id = db.execute("SELECT id FROM categories WHERE name = 'Family'").fetchone()[0]
                db.execute("INSERT OR IGNORE INTO movie_categories (movie_id, category_id) VALUES (?, ?)", (movie['id'], cat_id))
            
            db.commit()
        return 'ok'
    except Exception as e:
        print(f'  ERROR: {e}')
        return 'error'

def ingest_path(db: sqlite3.Connection, path: Path, library_id: int, auto_scrape: bool = True, category: str = None) -> bool:
    if path.is_file():
        folder = path.parent
        video_files = [path] if path.suffix.lower() in VIDEO_EXT else []
    else:
        folder = path
        video_files = find_video_files(folder)

    if not video_files:
        return False

    if not FOLDER_RE.match(folder.name):
        return False

    if SKIP_QUALITY.search(folder.name):
        if re.search(r'BLURAY|BRRIP|BDRIP', folder.name, re.IGNORECASE) and re.search(r'1080p', folder.name, re.IGNORECASE):
            if not any(f.suffix.lower() == '.mp4' for f in video_files): return False
        else: return False

    meta = parse_folder_name(folder.name)
    existing = db.execute(
        'SELECT id FROM movies WHERE LOWER(title)=LOWER(?) AND COALESCE(year,0)=COALESCE(?,0) AND library_id = ?',
        (meta['title'], meta['year'], library_id),
    ).fetchone()
    
    newly_added = False
    if existing:
        movie_id = existing['id']
    else:
        cur = db.execute(
            "INSERT INTO movies (title, year, quality, library_id) VALUES (?,?,?,?)",
            (meta['title'], meta['year'], meta['quality'], library_id)
        )
        movie_id = cur.lastrowid
        newly_added = True

    # Link category if provided
    if category:
        db.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (category,))
        cat_id = db.execute("SELECT id FROM categories WHERE name = ?", (category,)).fetchone()[0]
        db.execute("INSERT OR IGNORE INTO movie_categories (movie_id, category_id) VALUES (?, ?)", (movie_id, cat_id))
        if category.lower() == 'family':
            db.execute("UPDATE movies SET audience = 'family' WHERE id = ?", (movie_id,))

    files_added = 0
    for vf in video_files:
        size = vf.stat().st_size
        ff_meta = get_video_metadata(vf)
        if ff_meta and ff_meta.get('quality'):
            db.execute('UPDATE movies SET quality = ? WHERE id = ?', (ff_meta['quality'], movie_id))
        container = vf.suffix.lstrip('.')
        cur = db.execute(
            "INSERT OR IGNORE INTO files (library_id, movie_id, path, size_bytes, container) VALUES (?,?,?,?,?)",
            (library_id, movie_id, str(vf), size, container),
        )
        if cur.rowcount > 0: files_added += 1

    for sf in find_subtitle_files(folder):
        lang = detect_lang_from_path(sf)
        fmt  = sf.suffix.lstrip('.')
        db.execute("INSERT OR IGNORE INTO subtitles (movie_id, path, lang, format) VALUES (?,?,?,?)", (movie_id, str(sf), lang, fmt))

    db.commit()
    if newly_added and auto_scrape and API_KEY:
        movie_row = dict(db.execute('SELECT * FROM movies WHERE id=?', (movie_id,)).fetchone())
        if not movie_row.get('plot'):
            scrape_one(db, movie_row)

    return newly_added

def cmd_sync(args):
    media_dir = Path(args.dir)
    backup_db(args)
    db = open_db()
    library_id = get_library_id(db)
    folders = sorted(p for p in media_dir.iterdir() if p.is_dir())
    for folder in folders:
        ingest_path(db, folder, library_id, auto_scrape=not args.no_scrape, category=args.category)
    db.close()

def cmd_ingest(args):
    path = Path(args.path)
    backup_db(args)
    db = open_db()
    library_id = get_library_id(db)
    ingest_path(db, path, library_id, auto_scrape=not args.no_scrape, category=args.category)
    db.close()

def cmd_scrape(args):
    backup_db(args)
    db = open_db()
    movies = db.execute("SELECT * FROM movies").fetchall()
    for movie in movies:
        if args.force or not movie['plot']:
            scrape_one(db, dict(movie), dry_run=args.dry_run)
    db.close()

def cmd_status(args):
    db = open_db()
    movies = db.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
    files = db.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    subs = db.execute("SELECT COUNT(*) FROM subtitles").fetchone()[0]
    print(f"Movies: {movies}\nFiles: {files}\nSubtitles: {subs}")
    
    # Show categories
    cats = db.execute("""
        SELECT c.name, COUNT(mc.movie_id) as count 
        FROM categories c 
        LEFT JOIN movie_categories mc ON c.id = mc.category_id 
        GROUP BY c.name
    """).fetchall()
    if cats:
        print("\nCategories:")
        for cat in cats:
            print(f"  {cat['name']}: {cat['count']}")
            
    # Show audience
    audiences = db.execute("SELECT audience, COUNT(*) as count FROM movies GROUP BY audience").fetchall()
    if audiences:
        print("\nAudience:")
        for aud in audiences:
            print(f"  {aud['audience'] or 'Uncategorized'}: {aud['count']}")
            
    db.close()

def cmd_organize(args) -> None:
    db = open_db()
    movies = db.execute("SELECT id, title, year, quality, thumbnail FROM movies").fetchall()
    renamed_count = 0
    for movie in movies:
        files = db.execute("SELECT path FROM files WHERE movie_id = ?", (movie['id'],)).fetchall()
        if not files: continue
        current_dir = Path(files[0]['path']).parent
        if current_dir == Path(MEDIA_DIR): continue
        new_name = f"{movie['title']} ({movie['year']}) [{movie['quality'] or 'Unknown'}]"
        new_name = re.sub(r'[<>:"/\\|?*]', '_', new_name).strip()
        new_dir = current_dir.parent / new_name
        if current_dir.name != new_name and not new_dir.exists():
            try:
                os.rename(current_dir, new_dir)
                db.execute("UPDATE files SET path = REPLACE(path, ?, ?) WHERE movie_id = ?", (str(current_dir), str(new_dir), movie['id']))
                renamed_count += 1
            except PermissionError:
                print(f"  [!] PERMISSION DENIED: Cannot rename {current_dir.name}. Skipping organization for this item.")
            except Exception as e:
                print(f"  [!] ERROR: Could not rename {current_dir.name}: {e}")
    db.commit()
    db.close()
    print(f"Organized {renamed_count} folders.")

def cmd_cleanup(args) -> None:
    db = open_db()
    backup_db(args)
    print(f'\n--- INITIATING ROBUST DUPLICATE PURGE ---')
    
    movies = db.execute("SELECT id, title, year FROM movies").fetchall()
    
    # key: (normalized_title, year) -> primary_id
    seen = {}
    purged_count = 0
    
    for m in movies:
        pure_title = clean_movie_name(m['title'])
        # Handle common variations like "Pokemon" vs "Pokémon" (accents removed by clean_movie_name or lower)
        norm_key = (pure_title.lower(), m['year'])
        
        if norm_key in seen:
            primary_id = seen[norm_key]
            old_id = m['id']
            # Merge
            db.execute("UPDATE OR IGNORE files SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("UPDATE OR IGNORE subtitles SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("DELETE FROM movies WHERE id = ?", (old_id,))
            purged_count += 1
        else:
            seen[norm_key] = m['id']
            # Optionally update the title to the cleaned version if it was messy
            if m['title'] != pure_title:
                db.execute("UPDATE movies SET title = ? WHERE id = ?", (pure_title, m['id']))

    db.commit()
    db.close()
    print(f"PURGE_COMPLETE: {purged_count} redundant entities removed/merged.")

def cmd_sync_assets(args):
    db = open_db()
    movies = db.execute("SELECT id, title FROM movies").fetchall()
    for movie in movies:
        files = db.execute("SELECT path FROM files WHERE movie_id = ?", (movie['id'],)).fetchall()
        if files:
            movie_dir = Path(files[0]['path']).parent
            posters = list(movie_dir.glob("poster.*"))
            if posters:
                db.execute("UPDATE movies SET thumbnail = ? WHERE id = ?", (str(posters[0]), movie['id']))
    db.commit()
    db.close()

def cmd_reset(args):
    if Path(DB_PATH).exists(): os.remove(DB_PATH)

def cmd_full(args):
    # Ensure all required attributes exist for sub-commands
    if not hasattr(args, 'no_scrape'): args.no_scrape = False
    if not hasattr(args, 'no_backup'): args.no_backup = False
    if not hasattr(args, 'lax'): args.lax = False
    if not hasattr(args, 'force'): args.force = False
    if not hasattr(args, 'dry_run'): args.dry_run = False
    if not hasattr(args, 'category'): args.category = None
    
    cmd_sync(args)
    cmd_cleanup(args)
    cmd_organize(args)
    cmd_sync_assets(args)
    if not args.no_scrape:
        cmd_scrape(args)

def main():
    parser = argparse.ArgumentParser(prog='mm')
    sub = parser.add_subparsers(dest='command', required=True)
    
    p_sync = sub.add_parser('sync')
    p_sync.add_argument('dir', nargs='?', default=MEDIA_DIR)
    p_sync.add_argument('--category', help='Assign category to ingested movies')
    p_sync.add_argument('--no-scrape', action='store_true')
    p_sync.add_argument('--no-backup', action='store_true')
    
    p_ingest = sub.add_parser('ingest')
    p_ingest.add_argument('path')
    p_ingest.add_argument('--category', help='Assign category to movie')
    p_ingest.add_argument('--no-scrape', action='store_true')
    p_ingest.add_argument('--no-backup', action='store_true')
    
    sub.add_parser('cleanup').add_argument('--no-backup', action='store_true')
    sub.add_parser('organize').add_argument('--no-backup', action='store_true')
    
    p_scrape = sub.add_parser('scrape')
    p_scrape.add_argument('--force', action='store_true')
    p_scrape.add_argument('--dry-run', action='store_true')
    p_scrape.add_argument('--no-backup', action='store_true')
    
    sub.add_parser('status')
    sub.add_parser('sync-assets').add_argument('--lax', action='store_true')
    
    p_full = sub.add_parser('full')
    p_full.add_argument('--root', dest='dir', default=MEDIA_DIR)
    p_full.add_argument('--category', help='Default category for this run')
    p_full.add_argument('--lax', action='store_true')
    
    sub.add_parser('reset').add_argument('--force', action='store_true')
    args = parser.parse_args()
    dispatch = {
        'sync': cmd_sync, 'ingest': cmd_ingest, 'scrape': cmd_scrape,
        'status': cmd_status, 'organize': cmd_organize, 'cleanup': cmd_cleanup,
        'sync-assets': cmd_sync_assets, 'full': cmd_full, 'reset': cmd_reset,
    }
    dispatch[args.command](args)

if __name__ == '__main__':
    main()
