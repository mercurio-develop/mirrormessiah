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
  verify                    Check media integrity and mark unplayable titles for repair
  cleanup                   Identify and merge duplicate movie entries
  sync-assets               Link posters and verify 1080p MP4 compliance
  full                      Run ingest, cleanup, organize, sync-assets, and scrape
  stage  <src> [--dest DIR] Prepare new movies: clean noise, check duplicates, and move to dest
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

VIDEO_EXT = {'.mp4'}
SUB_EXT   = {'.srt', '.vtt', '.ass', '.ssa'}

# Folder naming pattern: "Title (Year) [Quality]" or "Title.Year.Quality"
FOLDER_RE = re.compile(
    r'^(?P<title>.+?)(?:\s*[\(\.]|\s+)(?P<year>(?:19|20)\d{2})(?:[\)\.]?\s*(?:\[(?P<quality>[^\]]+)\]|(?P<quality2>\d{3,4}p|4K|2160p|720p|1080p))?)?',
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
    ext = Path(name).suffix.lower()
    if ext in {'.mp4', '.mkv', '.avi', '.webm', '.mov', '.srt', '.vtt', '.ass', '.ssa'}:
        name = Path(name).stem
    
    tech_patterns = [
        r"\[.*?\]", r"\(.*?\)", 
        r"\d{4}p", r"\d{3}p", r"2160p", r"4k", r"bluray", r"web-dl", r"webrip", r"brrip", r"hdtv",
        r"x264", r"x265", r"hevc", r"aac", r"dts", r"dd5\.1", r"ddp5\.1", r"5\.1", r"5\s1", 
        r"ac3", r"yts", r"yify", r"remastered", r"extended", r"directors\.cut", r"10bit", 
        r"hdr", r"atmos", r"dv", r"dvdrip", r"v2", r"hdts", r"av1", r"multi", r"dual", 
        r"latino", r"subs", r"h\.\d{3}", r"h264", r"h265", r"WEB", r"AMZN", r"NF", r"DSNP",
        r"PROPER", r"REPACK", r"UNRATED", r"LIMITED", r"INTERNAL", r"RERIP", r"REAL", r"READNFO"
    ]
    for pattern in tech_patterns:
        name = re.sub(rf"\b{pattern}\b", " ", name, flags=re.IGNORECASE)

    name = re.sub(r"\b(18|19|20|21)\d{2}\b", " ", name)
    name = name.replace(".", " ").replace("_", " ").replace("-", " ")
    name = re.sub(r"[\(\)\[\]]", " ", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip().title()


def parse_folder_name(name: str) -> dict:
    """Extract title, year, quality from folder names with extreme prejudice against noise."""
    # Try the standard regex first
    m = FOLDER_RE.match(name)
    if m:
        quality = m.group('quality') or m.group('quality2') or None
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
    
    # Fallback: scan for year anywhere in the name
    year_match = re.search(r"\b(19|20)\d{2}\b", name)
    year = int(year_match.group()) if year_match else None
    
    # Clean the title aggressively
    title = clean_movie_name(name)
    if year:
        # Remove the year from the title if it's there
        title = re.sub(rf"\b{year}\b", " ", title, flags=re.IGNORECASE).strip()
    
    # Final quality scan
    quality_match = re.search(r"\b(1080p|720p|4K|2160p)\b", name, re.IGNORECASE)
    quality = quality_match.group().upper() if quality_match else None

    # Final cleanup to remove literal "None" string if it leaked in
    title = re.sub(r"\bNone\b", "", title, flags=re.IGNORECASE).strip()

    return {'title': title, 'year': year, 'quality': quality}


def get_yts_metadata(title: str, year: int | None = None) -> dict | None:
    """Fallback scraper: Infiltrate YTS mirrors for metadata without API keys."""
    mirrors = ["https://yts.mx", "https://yts.rs", "https://yts.do"]
    search_terms = [f"{title} {year}" if year else title, title]
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
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

def clean_source_folder(folder: Path) -> None:
    """Surgically remove garbage from a movie folder (txt, nfo, small files)."""
    if not folder.is_dir(): return
    
    garbage_ext = {'.txt', '.nfo', '.jpg', '.png', '.exe', '.url', '.html', '.htm', '.xml', '.zip'}
    for p in list(folder.rglob('*')):
        if p.is_file():
            # Remove by extension
            if p.suffix.lower() in garbage_ext:
                try: p.unlink()
                except: pass
                continue
            # Remove sample files (usually < 150MB)
            if 'sample' in p.name.lower() and p.stat().st_size < 150 * 1024 * 1024:
                try: p.unlink()
                except: pass
                continue
            # Remove very small files that aren't subtitles
            if p.stat().st_size < 1024 * 1024 and p.suffix.lower() not in SUB_EXT:
                try: p.unlink()
                except: pass

def detect_lang_from_path(path: Path) -> str:
    name = path.name.lower()
    
    # ISO 639-2 (3-letter) -> ISO 639-1 (2-letter)
    lang_map = {
        'eng': 'en', 'spa': 'es', 'fre': 'fr', 'fra': 'fr', 'ger': 'de', 'deu': 'de',
        'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh', 'zho': 'zh', 'rus': 'ru',
        'ara': 'ar', 'ben': 'bn', 'hin': 'hi', 'urd': 'ur', 'kor': 'ko', 'vie': 'vi',
        'tha': 'th', 'tur': 'tr', 'pol': 'pl', 'dut': 'nl', 'nld': 'nl', 'gre': 'el',
        'ell': 'el', 'heb': 'he', 'heb': 'he', 'swe': 'sv', 'nor': 'no', 'dan': 'da',
        'fin': 'fi', 'cat': 'ca', 'glg': 'gl', 'baq': 'eu', 'hrv': 'hr', 'cze': 'cs',
        'ces': 'cs', 'rum': 'ro', 'ron': 'ro', 'hun': 'hu', 'ukr': 'uk', 'ind': 'id',
        'msa': 'ms', 'may': 'ms', 'tel': 'te', 'tam': 'ta', 'kan': 'kn', 'mal': 'ml',
        'fil': 'fil'
    }

    # 1. Try to find 2-letter or 3-letter code between dots: .eng.srt or .en.srt
    parts = name.split('.')
    for p in parts:
        if p in lang_map: return lang_map[p]
        if len(p) == 2 and p.isalpha() and p in lang_map.values(): return p

    # 2. Try common language names as prefixes
    if 'english' in name: return 'en'
    if 'spanish' in name: return 'es'
    if 'french' in name: return 'fr'
    if 'german' in name: return 'de'
    if 'italian' in name: return 'it'
    if 'portuguese' in name: return 'pt'
    if 'japanese' in name: return 'ja'
    if 'chinese' in name: return 'zh'
    if 'arabic' in name: return 'ar'
    if 'russian' in name: return 'ru'
    if 'hindi' in name: return 'hi'
    if 'telugu' in name: return 'te'
    if 'tamil' in name: return 'ta'
    if 'kannada' in name: return 'kn'
    if 'malayalam' in name: return 'ml'
    if 'dansk' in name or 'danish' in name: return 'da'
    if 'brazilian' in name or 'latin american' in name: return 'es'

    return 'en'

def resync_movie_subtitles(db: sqlite3.Connection, movie_id: int, folder: Path) -> tuple[int, int, int]:
    """Remove broken subtitle DB rows and register any files found on disk."""
    removed = 0
    for row in db.execute('SELECT id, path FROM subtitles WHERE movie_id = ?', (movie_id,)).fetchall():
        if not Path(row['path']).exists():
            db.execute('DELETE FROM subtitles WHERE id = ?', (row['id'],))
            removed += 1

    added = 0
    found = 0
    if folder.exists():
        for sf in find_subtitle_files(folder):
            found += 1
            lang = detect_lang_from_path(sf)
            fmt = sf.suffix.lstrip('.')
            cur = db.execute(
                'INSERT OR IGNORE INTO subtitles (movie_id, path, lang, format) VALUES (?,?,?,?)',
                (movie_id, str(sf), lang, fmt),
            )
            if cur.rowcount > 0:
                added += 1

    return found, added, removed

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

def tmdb_search(title: str, year: int | str | None) -> dict | None:
    search_queries = [title, _clean(title)]
    
    # Clean the 'None' string if it passed through
    if year and str(year).lower() == 'none':
        year = None

    # Add short title fallback for long titles with subtitles
    if ',' in title or ':' in title:
        short = re.split(r'[,:]', title)[0].strip()
        if len(short) > 3:
            search_queries.append(short)
            search_queries.append(_clean(short))

    for query in search_queries:
        # Try with year first, then without
        for params in [{'query': query, 'year': year}, {'query': query}]:
            # Skip searching with year if it's missing or None
            if 'year' in params and not params.get('year'):
                continue
            
            # Final verification of parameters
            filtered = {k: v for k, v in params.items() if v is not None and str(v).lower() != 'none'}
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
        
        # If the movie record has no year but we found one in metadata, use it
        if not year and details.get('year'): # YTS fallback provides 'year' directly
            year = details.get('year')

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
    
    # Extreme Strictness: Ensure we actually have an MP4 file
    if not any(f.suffix.lower() == '.mp4' for f in video_files):
        return False

    meta = parse_folder_name(folder.name)
    if not meta['title']:
        # If we can't even get a title, use the folder name as title
        meta['title'] = clean_movie_name(folder.name)
    
    if not meta['title']:
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

    resync_movie_subtitles(db, movie_id, folder)

    db.commit()
    if newly_added and auto_scrape and API_KEY:
        movie_row = dict(db.execute('SELECT * FROM movies WHERE id=?', (movie_id,)).fetchone())
        if not movie_row.get('plot'):
            scrape_one(db, movie_row)

    return newly_added

def cmd_sync(args):
    media_dir = Path(args.dir)
    print(f"\n--- PHASE: Syncing Registry [{media_dir}] ---")
    backup_db(args)
    db = open_db()
    library_id = get_library_id(db)
    
    # 1. Add new movies
    folders = sorted(p for p in media_dir.iterdir() if p.is_dir())
    added = 0
    total = len(folders)
    
    for i, folder in enumerate(folders, 1):
        is_new = ingest_path(db, folder, library_id, auto_scrape=not args.no_scrape, category=args.category)
        if is_new:
            print(f"  [{i}/{total}] [+] Added: {folder.name}")
            added += 1
    
    # 2. Purge missing files/movies
    print(f"\n--- PHASE: Purging Missing Entities ---")
    files = db.execute("SELECT id, movie_id, path FROM files").fetchall()
    deleted_files = 0
    for f in files:
        if not Path(f['path']).exists():
            db.execute("DELETE FROM files WHERE id = ?", (f['id'],))
            deleted_files += 1
    
    # Remove movies that have no files left
    movies_to_remove = db.execute("""
        SELECT id, title FROM movies 
        WHERE id NOT IN (SELECT DISTINCT movie_id FROM files)
    """).fetchall()
    
    for m in movies_to_remove:
        print(f"  [-] Removed: {m['title']} (File not found)")
        db.execute("DELETE FROM movies WHERE id = ?", (m['id'],))
        db.execute("DELETE FROM subtitles WHERE movie_id = ?", (m['id'],))
        db.execute("DELETE FROM movie_categories WHERE movie_id = ?", (m['id'],))

    # 3. Resync subtitles for remaining movies
    print(f"\n--- PHASE: Resyncing Subtitles ---")
    orphan_subs = db.execute(
        "DELETE FROM subtitles WHERE movie_id NOT IN (SELECT id FROM movies)"
    ).rowcount
    sub_added = 0
    sub_removed = orphan_subs
    movies_with_files = db.execute("""
        SELECT DISTINCT m.id, m.title, f.path
        FROM movies m
        JOIN files f ON f.movie_id = m.id
    """).fetchall()
    seen = set()
    for row in movies_with_files:
        if row['id'] in seen:
            continue
        seen.add(row['id'])
        folder = Path(row['path']).parent
        found, added, removed = resync_movie_subtitles(db, row['id'], folder)
        sub_added += added
        sub_removed += removed
            
    db.commit()
    db.close()
    print(f"SYNC_COMPLETE: {added} added, {deleted_files} files purged.")
    print(f"  Subtitles: {sub_added} registered, {sub_removed} stale paths removed.")

def cmd_ingest(args):
    path = Path(args.path)
    backup_db(args)
    db = open_db()
    library_id = get_library_id(db)
    ingest_path(db, path, library_id, auto_scrape=not args.no_scrape, category=args.category)
    db.close()

def cmd_scrape(args):
    print(f"\n--- PHASE: Scraping Metadata ---")
    backup_db(args)
    db = open_db()
    movies = db.execute("SELECT * FROM movies").fetchall()
    scraped = 0
    total = len(movies)
    for i, movie in enumerate(movies, 1):
        if args.force or not movie['plot']:
            print(f"  [{i}/{total}] Scraping: {movie['title']}")
            status = scrape_one(db, dict(movie), dry_run=args.dry_run)
            if status == 'ok': scraped += 1
    db.close()
    print(f"SCRAPE_COMPLETE: {scraped} titles enriched.")

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
    movies = db.execute("SELECT id, title, year, quality FROM movies").fetchall()
    renamed_count = 0
    
    print(f"\n--- INITIATING FILESYSTEM REORGANIZATION ---")
    
    for movie in movies:
        # Get all files for this movie
        files = db.execute("SELECT id, path FROM files WHERE movie_id = ?", (movie['id'],)).fetchall()
        if not files: continue
        
        # Determine current folder
        current_path = Path(files[0]['path'])
        current_dir = current_path.parent
        
        # Skip if folder doesn't exist
        if not current_dir.exists():
            continue
        
        # Skip if it's already in the root media dir (shouldn't happen with standardized folders)
        if current_dir == Path(MEDIA_DIR): continue
        
        # Generate standardized name
        year_str = ""
        if movie['year'] and str(movie['year']).lower() != "none":
            year_str = f" ({movie['year']})"
            
        quality_str = ""
        if movie['quality'] and str(movie['quality']).lower() != "none":
            quality_str = f" [{movie['quality']}]"
            
        new_name = f"{movie['title']}{year_str}{quality_str}"
        new_name = re.sub(r'[<>:"/\\|?*]', '_', new_name).strip()
        
        new_dir = current_dir.parent / new_name
        
        if current_dir.name != new_name:
            if new_dir.exists():
                print(f"  [!] CONFLICT: Target folder '{new_name}' already exists. Skipping '{current_dir.name}'.")
                continue
                
            print(f"  [rename] '{current_dir.name}' -> '{new_name}'")
            try:
                os.rename(current_dir, new_dir)
                
                # Update all file paths in DB for this movie
                for f in files:
                    old_f_path = Path(f['path'])
                    new_f_path = new_dir / old_f_path.name
                    db.execute("UPDATE files SET path = ? WHERE id = ?", (str(new_f_path), f['id']))
                
                # Update all subtitle paths in DB for this movie
                subs = db.execute("SELECT id, path FROM subtitles WHERE movie_id = ?", (movie['id'],)).fetchall()
                for s in subs:
                    old_s_path = Path(s['path'])
                    try:
                        rel = old_s_path.relative_to(current_dir)
                        new_s_path = new_dir / rel
                    except ValueError:
                        new_s_path = new_dir / old_s_path.name
                    db.execute("UPDATE subtitles SET path = ? WHERE id = ?", (str(new_s_path), s['id']))
                
                # Update thumbnail path if it was inside the movie folder
                movie_data = db.execute("SELECT thumbnail FROM movies WHERE id = ?", (movie['id'],)).fetchone()
                if movie_data and movie_data['thumbnail'] and str(current_dir) in movie_data['thumbnail']:
                    new_thumb = movie_data['thumbnail'].replace(str(current_dir), str(new_dir))
                    db.execute("UPDATE movies SET thumbnail = ? WHERE id = ?", (new_thumb, movie['id']))
                
                renamed_count += 1
            except PermissionError:
                print(f"  [!] PERMISSION DENIED: Cannot rename {current_dir.name}.")
            except Exception as e:
                print(f"  [!] ERROR: Could not rename {current_dir.name}: {e}")
                
    db.commit()
    db.close()
    print(f"\nORGANIZE_COMPLETE: {renamed_count} folders synchronized with database names.")

def cmd_verify(args):
    print(f"\n--- PHASE: Verifying Media Integrity ---")
    db = open_db()
    movies = db.execute("SELECT id, title, needs_repair FROM movies").fetchall()
    repaired_count = 0
    broken_count = 0
    total = len(movies)
    
    for i, movie in enumerate(movies, 1):
        files = db.execute("SELECT id, path FROM files WHERE movie_id = ?", (movie['id'],)).fetchall()
        
        is_playable = False
        missing_file = False
        
        if not files:
            missing_file = True
        else:
            for f in files:
                p = Path(f['path'])
                if not p.exists():
                    missing_file = True
                    continue
                
                meta = get_video_metadata(p)
                if meta:
                    is_playable = True
                    break
        
        needs_repair = 1 if (not is_playable or missing_file) else 0
        
        if movie['needs_repair'] != needs_repair:
            db.execute("UPDATE movies SET needs_repair = ? WHERE id = ?", (needs_repair, movie['id']))
            if needs_repair == 1:
                print(f"  [{i}/{total}] [!] BROKEN: {movie['title']}")
                broken_count += 1
            else:
                print(f"  [{i}/{total}] [✓] FIXED: {movie['title']}")
                repaired_count += 1
        
    db.commit()
    db.close()
    print(f"\nVERIFICATION_COMPLETE:")
    print(f"  - New issues found: {broken_count}")
    print(f"  - Previously broken now fixed: {repaired_count}")

def cmd_cleanup(args) -> None:
    db = open_db()
    backup_db(args)
    print(f'\n--- INITIATING ROBUST DUPLICATE PURGE ---')
    
    purged_count = 0

    # Pass 1: Merge by Title and Year
    movies = db.execute("SELECT id, title, year FROM movies").fetchall()
    seen_naming = {} # key: (normalized_title, year) -> primary_id
    
    for m in movies:
        pure_title = clean_movie_name(m['title'])
        norm_key = (pure_title.lower(), m['year'])
        
        if norm_key in seen_naming:
            primary_id = seen_naming[norm_key]
            old_id = m['id']
            db.execute("UPDATE OR IGNORE files SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("UPDATE OR IGNORE subtitles SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("DELETE FROM movies WHERE id = ?", (old_id,))
            purged_count += 1
        else:
            seen_naming[norm_key] = m['id']
            if m['title'] != pure_title:
                db.execute("UPDATE movies SET title = ? WHERE id = ?", (pure_title, m['id']))

    # Pass 2: Merge by TMDB ID (catches duplicates discovered during scraping)
    movies = db.execute("SELECT id, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL").fetchall()
    seen_tmdb = {} # key: tmdb_id -> primary_id
    
    for m in movies:
        tid = m['tmdb_id']
        if tid in seen_tmdb:
            primary_id = seen_tmdb[tid]
            old_id = m['id']
            db.execute("UPDATE OR IGNORE files SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("UPDATE OR IGNORE subtitles SET movie_id = ? WHERE movie_id = ?", (primary_id, old_id))
            db.execute("DELETE FROM movies WHERE id = ?", (old_id,))
            purged_count += 1
        else:
            seen_tmdb[tid] = m['id']

    db.commit()
    db.close()
    print(f"PURGE_COMPLETE: {purged_count} redundant entities removed/merged.")

def cmd_stage(args):
    src_dir = Path(args.src)
    dest_dir = Path(args.dest or MEDIA_DIR)
    
    if not src_dir.exists():
        print(f"ERROR: Source directory not found: {src_dir}")
        return

    dest_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n--- INITIATING STAGING PIPELINE ---")
    print(f"Source: {src_dir}")
    print(f"Target: {dest_dir}\n")

    db = open_db()
    # Get set of existing movies for duplicate detection
    existing = { (clean_movie_name(r['title']).lower(), r['year']) for r in db.execute("SELECT title, year FROM movies").fetchall() }
    db.close()

    items = sorted(list(src_dir.iterdir()))
    moved_count = 0
    skipped_count = 0

    for item in items:
        if item.name.startswith('.'): continue
        
        meta = parse_folder_name(item.name)
        if not meta['title']: 
            print(f"  [?] Skipping unidentified: {item.name}")
            continue

        norm_key = (meta['title'].lower(), meta['year'])
        
        if norm_key in existing:
            print(f"  [!] DUPLICATE DETECTED: '{meta['title']} ({meta['year']})' is already in registry. Skipping.")
            skipped_count += 1
            continue

        quality_str = f" [{meta['quality']}]" if meta['quality'] else ""
        new_name = f"{meta['title']} ({meta['year']}){quality_str}"
        new_name = re.sub(r'[<>:"/\\|?*]', '_', new_name).strip()
        target_path = dest_dir / new_name

        if target_path.exists():
            print(f"  [!] TARGET EXISTS: '{new_name}' already in destination folder. Skipping.")
            skipped_count += 1
            continue

        print(f"  [+] Staging: {new_name}")
        
        if item.is_dir():
            clean_source_folder(item)
        
        try:
            if item.is_file():
                # Identified loose file: create a standardized folder for it
                if not target_path.exists():
                    target_path.mkdir(parents=True)
                shutil.move(str(item), str(target_path / item.name))
                print(f"  [wrapped] {item.name} -> {target_path.name}/")
            else:
                # Directory: move as-is (already cleaned)
                shutil.move(str(item), str(target_path))
            
            moved_count += 1
        except Exception as e:
            print(f"  [!] MOVE_ERROR for {item.name}: {e}")

    print(f"\nSTAGING_COMPLETE:")
    print(f"  - Moved/Cleaned: {moved_count}")
    print(f"  - Skipped (Duplicates): {skipped_count}")

def cmd_sync_assets(args):
    print(f"\n--- PHASE: Synchronizing Assets ---")
    db = open_db()
    movies = db.execute("SELECT id, title, thumbnail FROM movies").fetchall()
    synced = 0
    cleaned = 0
    
    for movie in movies:
        # Check if existing thumbnail is broken
        if movie['thumbnail'] and not movie['thumbnail'].startswith('http'):
            if not Path(movie['thumbnail']).exists():
                db.execute("UPDATE movies SET thumbnail = NULL WHERE id = ?", (movie['id'],))
                cleaned += 1
                continue

        # Try to find poster if missing
        if not movie['thumbnail']:
            files = db.execute("SELECT path FROM files WHERE movie_id = ?", (movie['id'],)).fetchall()
            if files:
                movie_dir = Path(files[0]['path']).parent
                posters = list(movie_dir.glob("poster.*"))
                if posters:
                    db.execute("UPDATE movies SET thumbnail = ? WHERE id = ?", (str(posters[0]), movie['id']))
                    synced += 1
                    
    db.commit()
    db.close()
    print(f"ASSET_SYNC_COMPLETE:")
    print(f"  - Posters Linked: {synced}")
    print(f"  - Broken Links Purged: {cleaned}")

def cmd_reset(args):
    if Path(DB_PATH).exists(): os.remove(DB_PATH)

def cmd_convert(args):
    media_dir = Path(args.dir)
    print(f"\n--- PHASE: Converting Non-Web Media [{media_dir}] ---")
    script_path = Path(__file__).parent / 'convert_to_web.py'
    
    extensions = {'.mkv', '.avi', '.webm', '.mov'}
    files_to_convert = [p for p in media_dir.rglob('*') if p.is_file() and p.suffix.lower() in extensions]
    
    if not files_to_convert:
        print("  [+] No non-MP4 media files found for conversion.")
        return
        
    for i, f in enumerate(files_to_convert, 1):
        print(f"\n  [{i}/{len(files_to_convert)}] Dispatching to conversion script: {f.name}")
        subprocess.run([sys.executable, str(script_path), str(f)])

    if files_to_convert:
        print("\n  [.] Registering extracted subtitles...")
        db = open_db()
        touched_movies = set()
        for f in files_to_convert:
            movie_file = db.execute('SELECT movie_id FROM files WHERE path = ?', (str(f),)).fetchone()
            if not movie_file:
                movie_file = db.execute(
                    'SELECT movie_id FROM files WHERE path LIKE ? LIMIT 1',
                    (str(f.with_suffix('.mp4')),),
                ).fetchone()
            if movie_file:
                touched_movies.add(movie_file['movie_id'])
        for movie_id in touched_movies:
            row = db.execute('SELECT path FROM files WHERE movie_id = ? LIMIT 1', (movie_id,)).fetchone()
            if row:
                found, added, removed = resync_movie_subtitles(db, movie_id, Path(row['path']).parent)
                if added or removed:
                    print(f"    [+] Movie {movie_id}: {added} subtitle(s) added, {removed} stale removed")
        db.commit()
        db.close()
        
    print("\nCONVERSION_COMPLETE.")

def cmd_full(args):
    print(f"\n==========================================")
    print(f"   MirrorMessiah: FULL SYSTEM INTEGRATION")
    print(f"==========================================\n")
    
    # Ensure all required attributes exist for sub-commands
    if not hasattr(args, 'no_scrape'): args.no_scrape = False
    if not hasattr(args, 'no_backup'): args.no_backup = False
    if not hasattr(args, 'lax'): args.lax = False
    if not hasattr(args, 'force'): args.force = False
    if not hasattr(args, 'dry_run'): args.dry_run = False
    if not hasattr(args, 'category'): args.category = None
    
    cmd_sync(args)
    
    print(f"\n--- PHASE: Cleaning Duplicates ---")
    cmd_cleanup(args)
    
    print(f"\n--- PHASE: Organizing Folders ---")
    cmd_organize(args)
    
    cmd_sync_assets(args)
    
    if not args.no_scrape:
        cmd_scrape(args)
        # Second organize pass: if scraping found missing years, apply them to the filesystem
        print(f"\n--- PHASE: Final Folder Alignment ---")
        cmd_organize(args)
    
    print(f"\n==========================================")
    print(f"   INTEGRATION COMPLETE")
    print(f"==========================================\n")

def main():
    parser = argparse.ArgumentParser(prog='mm', description='MirrorMessiah Management CLI')
    sub = parser.add_subparsers(dest='command', required=True)
    
    p_sync = sub.add_parser('sync', help='Ingest new movies into database')
    p_sync.add_argument('dir', nargs='?', default=MEDIA_DIR)
    p_sync.add_argument('--category', help='Assign category to ingested movies')
    p_sync.add_argument('--no-scrape', action='store_true')
    p_sync.add_argument('--no-backup', action='store_true')
    
    p_ingest = sub.add_parser('ingest', help='Ingest a single path or file')
    p_ingest.add_argument('path')
    p_ingest.add_argument('--category', help='Assign category to movie')
    p_ingest.add_argument('--no-scrape', action='store_true')
    p_ingest.add_argument('--no-backup', action='store_true')
    
    p_cleanup = sub.add_parser('cleanup', help='Identify and merge duplicate movie entries')
    p_cleanup.add_argument('--no-backup', action='store_true')
    
    p_organize = sub.add_parser('organize', help='Reflect Database renames to physical folder names on disk')
    p_organize.add_argument('--no-backup', action='store_true')

    p_verify = sub.add_parser('verify', help='Check media integrity and mark unplayable titles for repair')
    p_verify.add_argument('--no-backup', action='store_true')
    
    p_scrape = sub.add_parser('scrape', help='Scrape missing metadata from TMDB/YTS')
    p_scrape.add_argument('--force', action='store_true')
    p_scrape.add_argument('--dry-run', action='store_true')
    p_scrape.add_argument('--no-backup', action='store_true')
    
    p_stage = sub.add_parser('stage', help='Clean noise and move new movies to library with standardized naming')
    p_stage.add_argument('src', help='Source directory (external drive)')
    p_stage.add_argument('--dest', help='Destination library path')
    
    sub.add_parser('status', help='Display collection and database statistics')
    sub.add_parser('sync-assets', help='Link posters and purge broken artwork paths')
    
    p_full = sub.add_parser('full', help='Complete pipeline: Sync -> Cleanup -> Organize -> Scrape')
    p_full.add_argument('--root', dest='dir', default=MEDIA_DIR)
    p_full.add_argument('--category', help='Default category for this run')
    
    p_reset = sub.add_parser('reset', help='Factory reset: permanently delete the database')
    p_reset.add_argument('--force', action='store_true')
    
    p_convert = sub.add_parser('convert', help='Detect non-MP4 files (MKV, AVI, etc.) and convert them to web-optimized MP4')
    p_convert.add_argument('dir', nargs='?', default=MEDIA_DIR)
    
    args = parser.parse_args()
    dispatch = {
        'sync': cmd_sync, 'ingest': cmd_ingest, 'scrape': cmd_scrape,
        'status': cmd_status, 'organize': cmd_organize, 'cleanup': cmd_cleanup,
        'sync-assets': cmd_sync_assets, 'full': cmd_full, 'reset': cmd_reset,
        'stage': cmd_stage, 'verify': cmd_verify, 'convert': cmd_convert
    }
    dispatch[args.command](args)

if __name__ == '__main__':
    main()
