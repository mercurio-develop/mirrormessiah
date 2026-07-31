#!/usr/bin/env python3
"""
series_cli — MirrorMessiah Series CLI

Commands:
  sync   <media_dir>        Scan directory for new series, ingest + auto-scrape
"""

import argparse
import os
import re
import sqlite3
import sys
import time
import subprocess
import json
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / '.env')

API_KEY   = os.getenv('TMDB_API_KEY')
DB_PATH   = os.getenv('DB_PATH') or str(ROOT / 'media.db')
SERIES_DIR = os.getenv('SERIES_DIR') or os.getenv('MEDIA_DIR') or '/media'
TMDB_BASE = 'https://api.themoviedb.org/3'
IMG_BASE  = 'https://image.tmdb.org/t/p/w500'
DELAY     = 0.25
VIDEO_EXT = {'.mp4', '.mkv', '.avi'}
SUB_EXT   = {'.srt', '.vtt', '.ass', '.ssa'}

# Regex for "S01E05" or "1x05"
EPISODE_RE = re.compile(r'S(?P<season>\d+)\s*E(?P<episode>\d+)|(?P<season2>\d+)x(?P<episode2>\d+)', re.IGNORECASE)

# Video widths often mistaken for season numbers (e.g. "1080x01" parsed as S1080E01).
RESOLUTION_WIDTHS = frozenset({480, 576, 720, 1080, 1280, 1920, 2160, 3840})
KNOWN_RESOLUTIONS = frozenset({
    (720, 480), (720, 576), (1280, 720), (1920, 1080), (3840, 2160),
})

def is_bogus_season_episode(season: int, episode: int) -> bool:
    if (season, episode) in KNOWN_RESOLUTIONS:
        return True
    # "1080x01" style: width token + small episode index, not a real season.
    return season in RESOLUTION_WIDTHS and episode <= 999

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

def clean_source_folder(folder: Path, aggressive=False) -> None:
    """Surgically remove garbage from a media folder (txt, nfo, small files)."""
    if not folder.is_dir(): return

    garbage_ext = {'.txt', '.nfo', '.png', '.exe', '.url', '.html', '.htm', '.xml', '.zip', '.rar', '.bak', '.sfv'}
    for p in list(folder.rglob('*')):
        if p.is_file():
            # Keep poster, backdrop, banner, fanart, and episode thumbnails if they exist, unless aggressive mode is on
            if not aggressive and (
                p.name.lower() in ('poster.jpg', 'backdrop.jpg', 'banner.jpg', 'fanart.jpg')
                or p.name.lower().endswith('-thumb.jpg')
            ):
                continue
            
            # Unconditionally remove .bak files (they are huge leftovers)
            if p.suffix.lower() == '.bak':
                try: 
                    p.unlink()
                    print(f"    [clean] Removed leftover backup: {p.name}")
                except: pass
                continue

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

def _ensure_tables(db: sqlite3.Connection) -> None:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS series (
          id          INTEGER PRIMARY KEY,
          library_id  INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          year        INTEGER,
          plot        TEXT,
          rating      REAL,
          tmdb_id     INTEGER,
          imdb_id     TEXT,
          thumbnail   TEXT,
          genres      TEXT,
          audience    TEXT CHECK(audience IN ('family', 'adult')) DEFAULT NULL,
          director    TEXT,
          language    TEXT,
          needs_repair INTEGER DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS seasons (
          id            INTEGER PRIMARY KEY,
          series_id     INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
          season_number INTEGER NOT NULL,
          title         TEXT,
          plot          TEXT,
          poster        TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(series_id, season_number)
        );

        CREATE TABLE IF NOT EXISTS episodes (
          id             INTEGER PRIMARY KEY,
          season_id      INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
          episode_number INTEGER NOT NULL,
          title          TEXT,
          plot           TEXT,
          runtime        INTEGER,
          thumbnail      TEXT,
          needs_repair   INTEGER DEFAULT 0,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(season_id, episode_number)
        );

        CREATE TABLE IF NOT EXISTS episode_files (
          id                INTEGER PRIMARY KEY,
          library_id        INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          episode_id        INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          path              TEXT NOT NULL UNIQUE,
          size_bytes        INTEGER,
          container         TEXT,
          added_at          TEXT NOT NULL DEFAULT (datetime('now')),
          mime_type         TEXT,
          duration_sec      INTEGER,
          width             INTEGER,
          height            INTEGER,
          video_codec       TEXT,
          audio_codec       TEXT,
          language          TEXT
        );

        CREATE TABLE IF NOT EXISTS episode_subtitles (
          id          INTEGER PRIMARY KEY,
          episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          file_id     INTEGER REFERENCES episode_files(id) ON DELETE CASCADE,
          path        TEXT NOT NULL UNIQUE,
          lang        TEXT,
          label       TEXT,
          format      TEXT,
          default_flag INTEGER DEFAULT 0,
          size_bytes  INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_seasons_series ON seasons(series_id);
        CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_episode_subtitles_episode ON episode_subtitles(episode_id);
    """)
    db.commit()

def open_db() -> sqlite3.Connection:
    if not Path(DB_PATH).exists():
        print(f'ERROR: DB not found: {DB_PATH}')
        sys.exit(1)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA busy_timeout = 30000')
    _ensure_tables(db)
    return db

def get_library_id(db: sqlite3.Connection) -> int:
    row = db.execute('SELECT id FROM libraries WHERE root_path = ?', (SERIES_DIR.rstrip('/'),)).fetchone()
    if row:
        return row['id']
    cur = db.execute("INSERT INTO libraries (name, root_path) VALUES (?, ?)", ('Series', SERIES_DIR.rstrip('/')))
    db.commit()
    return cur.lastrowid

def clean_name(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in {'.mp4', '.mkv', '.avi', '.webm', '.mov', '.srt', '.vtt', '.ass', '.ssa'}:
        name = Path(name).stem
    tech_patterns = [
        r"\[.*?\]", r"\(.*?\)", 
        r"\d{4}p", r"\d{3}p", r"2160p", r"4k", r"bluray", r"web-dl", r"webrip", r"brrip", r"hdtv",
        r"x264", r"x265", r"hevc", r"aac", r"dts", r"dd5\.1", r"ddp5\.1", r"5\.1", r"5\s1", 
        r"ac3", r"yts", r"yify", r"multi", r"dual", r"subs", r"originalaudio", r"s\d{2}", r"season\s*\d+", r"complete", r"series", r"ova", r"xvid", r"av1"
    ]
    for pattern in tech_patterns:
        name = re.sub(rf"\b{pattern}\b", " ", name, flags=re.IGNORECASE)

    name = re.sub(r'[\(\)\[\]]', ' ', name)
    name = re.sub(r'\b(19|20)\d{2}\b', '', name)
    name = name.replace(".", " ").replace("_", " ").replace("-", " ")
    name = re.sub(r'\s+season\s*$', '', name, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', name).strip().title()

def extract_year(name: str) -> int | None:
    match = re.search(r'\b(19|20)\d{2}\b', name)
    return int(match.group()) if match else None

def extract_episode_info(name: str, parent_name: str):
    # 1. Try standard S01E01 or 1x01 (skip resolution-shaped false positives like 1080x01)
    m = EPISODE_RE.search(name)
    if m:
        season = int(m.group('season') or m.group('season2'))
        ep = int(m.group('episode') or m.group('episode2'))
        if is_bogus_season_episode(season, ep):
            sm = re.search(r'Season\s*(\d+)', parent_name, re.I)
            if sm and int(sm.group(1)) not in RESOLUTION_WIDTHS:
                return int(sm.group(1)), ep
            return 1, ep
        return season, ep

    # 2. Try to find an episode number with a common prefix: E01, EP01, Episode 01, _ep01, - E01, OVA - E1, Part 1
    ep_num = None
    ep_match = re.search(r'(?:[_\-\s](?:E|EP|Episode|Part)\s*0*(\d+))', name, re.IGNORECASE)
    if ep_match:
        ep_num = int(ep_match.group(1))

    # 3. Look for standalone/anime episode numbers like "- 01 v2"
    if ep_num is None:
        anime_match = re.search(r'(?:-\s*0*(\d{1,3})\s*(?:v\d|\[|\())', name)
        if anime_match:
            ep_num = int(anime_match.group(1))

    # 4. Fallback: generic digits if inside a "Season" folder (e.g. "01 - Pilot.mp4")
    sm = re.search(r'Season\s*(\d+)', parent_name, re.I)
    if ep_num is None and sm:
        fallback_match = re.search(r'(?:^|[_\-\s])0*(\d{1,3})(?:[_\-\.\s]|$)', name)
        if fallback_match:
            ep_num = int(fallback_match.group(1))

    # 5. Additional Fallback: generic trailing digits in the filename (ignoring 4-digit years)
    if ep_num is None:
        name_without_ext = os.path.splitext(name)[0]
        clean_stem = re.sub(r'\b(19|20)\d{2}\b', '', name_without_ext)
        trailing_match = re.search(r'(?:[_\-\s]|^)0*(\d{1,3})$', clean_stem.strip())
        if trailing_match:
            ep_num = int(trailing_match.group(1))

    if ep_num is not None:
        if sm:
            return int(sm.group(1)), ep_num
        # Default to season 1 for standalone/anime files
        return 1, ep_num

    return None, None

def tmdb_get(endpoint: str, **params) -> dict:
    if not API_KEY: return {}
    params['api_key'] = API_KEY
    r = requests.get(f'{TMDB_BASE}{endpoint}', params=params, timeout=10)
    if r.ok: return r.json()
    return {}

def compute_absolute_episode(
    db: sqlite3.Connection, series_id: int, season_num: int, ep_num: int,
) -> int:
    """1-based episode index across prior seasons (for TMDB cross-season lookup)."""
    prior = db.execute("""
        SELECT COALESCE(SUM(max_ep), 0) AS total
        FROM (
            SELECT MAX(e.episode_number) AS max_ep
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            WHERE s.series_id = ? AND s.season_number < ?
            GROUP BY s.season_number
        )
    """, (series_id, season_num)).fetchone()
    return (prior['total'] or 0) + ep_num

def build_tmdb_absolute_index(tmdb_id: int) -> dict[int, dict]:
    """Map absolute episode number (excluding specials) to TMDB episode payload."""
    index: dict[int, dict] = {}
    details = tmdb_get(f'/tv/{tmdb_id}')
    if not details:
        return index
    abs_num = 0
    seasons = sorted(
        (s for s in details.get('seasons', []) if s.get('season_number', 0) > 0),
        key=lambda s: s['season_number'],
    )
    for season in seasons:
        sn = season['season_number']
        s_details = tmdb_get(f'/tv/{tmdb_id}/season/{sn}')
        if not s_details:
            continue
        for ep_data in s_details.get('episodes', []):
            abs_num += 1
            index[abs_num] = ep_data
        time.sleep(DELAY)
    return index

def repair_resolution_seasons(db: sqlite3.Connection) -> int:
    """Reassign seasons created from mis-parsed resolution tokens (e.g. 1080 -> season 1)."""
    placeholders = ','.join('?' * len(RESOLUTION_WIDTHS))
    bad_seasons = db.execute(
        f"SELECT id, series_id, season_number FROM seasons WHERE season_number IN ({placeholders})",
        tuple(RESOLUTION_WIDTHS),
    ).fetchall()
    fixed = 0
    for row in bad_seasons:
        series_id = row['series_id']
        bad_id = row['id']
        bad_num = row['season_number']
        target = db.execute(
            "SELECT id FROM seasons WHERE series_id = ? AND season_number = 1",
            (series_id,),
        ).fetchone()
        if target:
            target_id = target['id']
            for ep in db.execute(
                "SELECT id, episode_number FROM episodes WHERE season_id = ?", (bad_id,),
            ).fetchall():
                existing = db.execute(
                    "SELECT id FROM episodes WHERE season_id = ? AND episode_number = ?",
                    (target_id, ep['episode_number']),
                ).fetchone()
                if existing:
                    db.execute(
                        "UPDATE OR IGNORE episode_files SET episode_id = ? WHERE episode_id = ?",
                        (existing['id'], ep['id']),
                    )
                    db.execute(
                        "UPDATE OR IGNORE episode_subtitles SET episode_id = ? WHERE episode_id = ?",
                        (existing['id'], ep['id']),
                    )
                    db.execute("DELETE FROM episodes WHERE id = ?", (ep['id'],))
                else:
                    db.execute(
                        "UPDATE episodes SET season_id = ? WHERE id = ?",
                        (target_id, ep['id']),
                    )
            db.execute("DELETE FROM seasons WHERE id = ?", (bad_id,))
        else:
            db.execute(
                "UPDATE seasons SET season_number = 1 WHERE id = ?",
                (bad_id,),
            )
        fixed += 1
        print(f"  [fix] Repaired resolution season S{bad_num:02d} -> S01")
    return fixed

def detect_lang_from_path(path: Path) -> str:
    name = path.name.lower()
    lang_map = {
        'eng': 'en', 'spa': 'es', 'fre': 'fr', 'fra': 'fr', 'ger': 'de', 'deu': 'de',
        'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh', 'zho': 'zh', 'rus': 'ru',
        'ara': 'ar', 'ben': 'bn', 'hin': 'hi', 'urd': 'ur', 'kor': 'ko', 'vie': 'vi',
        'tha': 'th', 'tur': 'tr', 'pol': 'pl', 'dut': 'nl', 'nld': 'nl', 'gre': 'el',
        'ell': 'el', 'heb': 'he', 'swe': 'sv', 'nor': 'no', 'dan': 'da',
        'fin': 'fi', 'cat': 'ca', 'glg': 'gl', 'baq': 'eu', 'hrv': 'hr', 'cze': 'cs',
        'ces': 'cs', 'rum': 'ro', 'ron': 'ro', 'hun': 'hu', 'ukr': 'uk', 'ind': 'id',
        'msa': 'ms', 'may': 'ms'
    }
    parts = name.split('.')
    for p in parts:
        if p in lang_map: return lang_map[p]
        if len(p) == 2 and p.isalpha() and p in lang_map.values(): return p
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
    return 'en'

def find_subtitle_files(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return [p for p in folder.rglob('*') if p.is_file() and p.suffix.lower() in SUB_EXT]

def subtitle_matches_episode(sub_path: Path, season_number: int, episode_number: int) -> bool:
    season_num, ep_num = extract_episode_info(sub_path.name, sub_path.parent.name)
    return season_num == season_number and ep_num == episode_number

def resync_episode_subtitles(db: sqlite3.Connection, episode_id: int, season_number: int, episode_number: int) -> tuple[int, int, int]:
    files = db.execute('SELECT path FROM episode_files WHERE episode_id = ?', (episode_id,)).fetchall()
    if not files:
        return 0, 0, 0

    removed = 0
    for row in db.execute('SELECT id, path FROM episode_subtitles WHERE episode_id = ?', (episode_id,)).fetchall():
        if not Path(row['path']).exists():
            db.execute('DELETE FROM episode_subtitles WHERE id = ?', (row['id'],))
            removed += 1

    matched: dict[str, Path] = {}
    for file_row in files:
        ep_dir = Path(file_row['path']).parent
        video_stem = Path(file_row['path']).stem
        for sub_path in find_subtitle_files(ep_dir):
            if subtitle_matches_episode(sub_path, season_number, episode_number):
                matched[str(sub_path)] = sub_path
                continue
            sub_stem = sub_path.stem
            if sub_stem == video_stem or sub_stem.startswith(f'{video_stem}.') or sub_stem.startswith(f'{video_stem}-'):
                matched[str(sub_path)] = sub_path

    added = 0
    existing = {row['path'] for row in db.execute('SELECT path FROM episode_subtitles WHERE episode_id = ?', (episode_id,)).fetchall()}
    for sub_path in matched.values():
        if str(sub_path) in existing:
            continue
        lang = detect_lang_from_path(sub_path)
        fmt = sub_path.suffix.lstrip('.')
        db.execute(
            'INSERT OR IGNORE INTO episode_subtitles (episode_id, path, lang, format) VALUES (?,?,?,?)',
            (episode_id, str(sub_path), lang, fmt),
        )
        if db.execute('SELECT changes()').fetchone()[0]:
            added += 1

    return len(matched), added, removed

def resync_series_subtitles(db: sqlite3.Connection, series_id: int) -> tuple[int, int, int]:
    db.execute('DELETE FROM episode_subtitles WHERE episode_id NOT IN (SELECT id FROM episodes)')
    episodes = db.execute("""
        SELECT e.id, s.season_number, e.episode_number
        FROM episodes e
        JOIN seasons s ON s.id = e.season_id
        WHERE s.series_id = ?
    """, (series_id,)).fetchall()

    found = added = removed = 0
    for ep in episodes:
        f, a, r = resync_episode_subtitles(db, ep['id'], ep['season_number'], ep['episode_number'])
        found += f
        added += a
        removed += r
    return found, added, removed

def ingest_series(db: sqlite3.Connection, series_folder: Path, lib_id: int):
    title = clean_name(series_folder.name)
    year = extract_year(series_folder.name)

    print(f"Processing Series: {title}")
    
    # 1. Ensure series exists
    series_row = db.execute("SELECT id FROM series WHERE LOWER(title) = LOWER(?)", (title,)).fetchone()
    if series_row:
        series_id = series_row['id']
    else:
        cur = db.execute("INSERT INTO series (library_id, title, year) VALUES (?,?,?)", (lib_id, title, year))
        series_id = cur.lastrowid
        
        # Scrape TMDB
        if API_KEY:
            res = tmdb_get('/search/tv', query=title, first_air_date_year=year)
            if res and res.get('results'):
                tv = res['results'][0]
                db.execute("UPDATE series SET plot=?, rating=?, tmdb_id=? WHERE id=?", 
                          (tv.get('overview'), tv.get('vote_average'), tv.get('id'), series_id))

    # 2. Iterate seasons & episodes
    for ep_file in series_folder.rglob('*'):
        if any(part.startswith('.') for part in ep_file.relative_to(series_folder).parts):
            continue
        if ep_file.is_file() and ep_file.suffix.lower() in VIDEO_EXT:
            season_num, ep_num = extract_episode_info(ep_file.name, ep_file.parent.name)
            
            if season_num is None or ep_num is None:
                print(f"  [?] Skipping unparsable episode: {ep_file.name}")
                continue

            # Ensure season
            season_row = db.execute("SELECT id FROM seasons WHERE series_id=? AND season_number=?", (series_id, season_num)).fetchone()
            if season_row:
                season_id = season_row['id']
            else:
                cur = db.execute("INSERT INTO seasons (series_id, season_number) VALUES (?,?)", (series_id, season_num))
                season_id = cur.lastrowid

            # Ensure episode
            ep_row = db.execute("SELECT id FROM episodes WHERE season_id=? AND episode_number=?", (season_id, ep_num)).fetchone()
            if ep_row:
                ep_id = ep_row['id']
            else:
                cur = db.execute("INSERT INTO episodes (season_id, episode_number, title) VALUES (?,?,?)", (season_id, ep_num, f"Episode {ep_num}"))
                ep_id = cur.lastrowid

            # Ensure file
            file_row = db.execute("SELECT id FROM episode_files WHERE episode_id=? AND path=?", (ep_id, str(ep_file))).fetchone()
            if not file_row:
                db.execute("INSERT OR IGNORE INTO episode_files (library_id, episode_id, path, size_bytes, container) VALUES (?,?,?,?,?)",
                           (lib_id, ep_id, str(ep_file), ep_file.stat().st_size, ep_file.suffix.lstrip('.')))
                print(f"  [+] Added: S{season_num:02d}E{ep_num:02d} -> {ep_file.name}")

    # 3. Handle subtitles
    for sub_file in series_folder.rglob('*'):
        if any(part.startswith('.') for part in sub_file.relative_to(series_folder).parts):
            continue
        if sub_file.is_file() and sub_file.suffix.lower() in SUB_EXT:
            season_num, ep_num = extract_episode_info(sub_file.name, sub_file.parent.name)
            if season_num is None or ep_num is None: continue
            
            # Find the episode
            ep = db.execute("""
                SELECT e.id FROM episodes e
                JOIN seasons s ON e.season_id = s.id
                WHERE s.series_id = ? AND s.season_number = ? AND e.episode_number = ?
            """, (series_id, season_num, ep_num)).fetchone()
            
            if ep:
                lang = detect_lang_from_path(sub_file)
                fmt = sub_file.suffix.lstrip('.')
                db.execute("INSERT OR IGNORE INTO episode_subtitles (episode_id, path, lang, format, size_bytes) VALUES (?,?,?,?,?)",
                           (ep['id'], str(sub_file), lang, fmt, sub_file.stat().st_size))

    db.commit()

def cmd_sync(args):
    media_dir = Path(args.dir)
    print(f"\n--- PHASE: Syncing Series [{media_dir}] ---")
    db = open_db()
    lib_id = get_library_id(db)

    if not media_dir.exists():
        print(f"ERROR: Series directory not found: {media_dir}")
        return

    for item in sorted(media_dir.iterdir()):
        if item.is_dir():
            ingest_series(db, item, lib_id)

    print(f"\n--- PHASE: Resyncing Episode Subtitles ---")
    db.execute('DELETE FROM episode_subtitles WHERE episode_id NOT IN (SELECT id FROM episodes)')
    sub_added = sub_removed = 0
    for series in db.execute('SELECT id, title FROM series').fetchall():
        found, added, removed = resync_series_subtitles(db, series['id'])
        sub_added += added
        sub_removed += removed
    print(f"\n--- PHASE: Linking Local Artwork ---")
    discover_all_local_artwork(db)
    db.commit()
    stats = count_episode_thumbnail_stats(db)
    total_series = db.execute("SELECT COUNT(*) AS n FROM series").fetchone()['n']

    db.close()
    print("SYNC_COMPLETE")
    print(f"  Subtitles: {sub_added} registered, {sub_removed} stale paths removed.")
    print(f"  Thumbnails: {total_series} series, {format_thumbnail_stats(stats)}")

def cmd_cleanup(args):
    print(f"\n--- INITIATING SERIES REGISTRY PURGE & CLEANUP ---")
    db = open_db()
    
    # 1. Purge missing files
    print(f"  [.] Checking for missing files...")
    files = db.execute("SELECT id, path FROM episode_files").fetchall()
    deleted_files = 0
    for f in files:
        if not Path(f['path']).exists():
            db.execute("DELETE FROM episode_files WHERE id = ?", (f['id'],))
            deleted_files += 1

    subs = db.execute("SELECT id, path FROM episode_subtitles").fetchall()
    deleted_subs = 0
    for s in subs:
        if not Path(s['path']).exists():
            db.execute("DELETE FROM episode_subtitles WHERE id = ?", (s['id'],))
            deleted_subs += 1

    # 2. Purge orphaned episodes, seasons, and series
    db.execute("DELETE FROM episodes WHERE id NOT IN (SELECT episode_id FROM episode_files)")
    db.execute("DELETE FROM seasons WHERE id NOT IN (SELECT season_id FROM episodes)")
    db.execute("DELETE FROM series WHERE id NOT IN (SELECT series_id FROM seasons)")

    series_list = db.execute("SELECT id, title, year FROM series").fetchall()
    
    seen_naming = {}
    purged_count = 0
    fixed_titles = 0

    for s in series_list:
        old_id = s['id']
        old_title = s['title']
        pure_title = clean_name(old_title)
        
        # If the title was dirty, update it
        if old_title != pure_title:
            db.execute("UPDATE series SET title = ? WHERE id = ?", (pure_title, old_id))
            fixed_titles += 1
            s_title = pure_title
        else:
            s_title = old_title
            
        norm_key = (s_title.lower(), s['year'])
        
        if norm_key in seen_naming:
            primary_id = seen_naming[norm_key]
            # Merge seasons and episodes from old_id to primary_id
            seasons = db.execute("SELECT id, season_number FROM seasons WHERE series_id = ?", (old_id,)).fetchall()
            for old_season in seasons:
                # Check if primary has this season
                primary_season = db.execute("SELECT id FROM seasons WHERE series_id = ? AND season_number = ?", (primary_id, old_season['season_number'])).fetchone()
                
                if primary_season:
                    # Move episodes to primary season
                    p_s_id = primary_season['id']
                    episodes = db.execute("SELECT id, episode_number FROM episodes WHERE season_id = ?", (old_season['id'],)).fetchall()
                    for old_ep in episodes:
                        # Check if primary season has this episode
                        primary_ep = db.execute("SELECT id FROM episodes WHERE season_id = ? AND episode_number = ?", (p_s_id, old_ep['episode_number'])).fetchone()
                        if primary_ep:
                            p_e_id = primary_ep['id']
                            db.execute("UPDATE OR IGNORE episode_files SET episode_id = ? WHERE episode_id = ?", (p_e_id, old_ep['id']))
                            db.execute("UPDATE OR IGNORE episode_subtitles SET episode_id = ? WHERE episode_id = ?", (p_e_id, old_ep['id']))
                            db.execute("DELETE FROM episodes WHERE id = ?", (old_ep['id'],))
                        else:
                            db.execute("UPDATE episodes SET season_id = ? WHERE id = ?", (p_s_id, old_ep['id']))
                    db.execute("DELETE FROM seasons WHERE id = ?", (old_season['id'],))
                else:
                    db.execute("UPDATE seasons SET series_id = ? WHERE id = ?", (primary_id, old_season['id']))
                    
            db.execute("DELETE FROM series WHERE id = ?", (old_id,))
            purged_count += 1
        else:
            seen_naming[norm_key] = old_id

    repaired_seasons = repair_resolution_seasons(db)

    db.commit()
    db.close()
    print(f"CLEANUP_COMPLETE: Fixed {fixed_titles} titles. Merged {purged_count} duplicates. Repaired {repaired_seasons} resolution seasons.")

def cmd_organize(args):
    print(f"\n--- INITIATING FILESYSTEM REORGANIZATION (SERIES) ---")
    db = open_db()
    series_list = db.execute("SELECT id, title, year, thumbnail FROM series").fetchall()
    renamed_folders = 0
    renamed_files = 0
    skipped = 0

    for s in series_list:
        series_id = s['id']
        series_title = s['title']
        series_year = s['year']
        
        # Build standard series folder name
        year_str = f" ({series_year})" if series_year else ""
        standard_series_name = re.sub(r'[<>:"/\\|?*]', '_', f"{series_title}{year_str}").strip()
        standard_series_path = Path(SERIES_DIR) / standard_series_name

        # Move series poster if path changed
        if s['thumbnail']:
            old_poster_path = Path(s['thumbnail'])
            if old_poster_path.exists():
                new_poster_path = standard_series_path / 'poster.jpg'
                if old_poster_path != new_poster_path:
                    if new_poster_path.exists():
                        try: old_poster_path.unlink()
                        except: pass
                    else:
                        standard_series_path.mkdir(parents=True, exist_ok=True)
                        os.rename(old_poster_path, new_poster_path)
                    db.execute("UPDATE series SET thumbnail = ? WHERE id = ?", (str(new_poster_path), series_id))

        episodes = db.execute("""
            SELECT e.id as ep_id, e.episode_number, e.title as ep_title, s.season_number, f.id as file_id, f.path
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            JOIN episode_files f ON f.episode_id = e.id
            WHERE s.series_id = ?
        """, (series_id,)).fetchall()

        if not episodes: continue

        for ep in episodes:
            old_path = Path(ep['path'])
            
            title_part = ""
            if ep['ep_title'] and not ep['ep_title'].lower().startswith("episode "):
                clean_ep_title = re.sub(r'[<>:"/\\|?*]', '_', ep['ep_title']).strip()
                title_part = f" - {clean_ep_title}"

            season_folder_name = f"Season {ep['season_number']:02d}"
            standard_file_name = f"S{ep['season_number']:02d}E{ep['episode_number']:02d}{title_part}{old_path.suffix}"
            
            new_dir = standard_series_path / season_folder_name
            new_path = new_dir / standard_file_name

            # Self-healing database check: if file is already at new_path on disk but DB points to old_path
            if old_path != new_path and not old_path.exists() and new_path.exists():
                db.execute("UPDATE episode_files SET path = ? WHERE id = ?", (str(new_path), ep['file_id']))
                old_path = new_path

            # Skip if file doesn't exist at all
            if not old_path.exists():
                continue

            # If the video file needs to be relocated
            if old_path != new_path:
                if new_path.exists():
                    print(f"  [!] CONFLICT: '{new_path.name}' already exists. Skipping.")
                    skipped += 1
                    continue

                try:
                    new_dir.mkdir(parents=True, exist_ok=True)
                    os.rename(old_path, new_path)
                    
                    # Update DB
                    db.execute("UPDATE episode_files SET path = ? WHERE id = ?", (str(new_path), ep['file_id']))
                    print(f"  [rename] '{old_path.name}' -> '{new_dir.parent.name}/{new_dir.name}/{new_path.name}'")
                    renamed_files += 1
                    old_path = new_path
                except Exception as e:
                    print(f"  [!] ERROR: Could not rename {old_path.name}: {e}")
                    continue

            # Process subtitles, posters, and thumbnails associated with this episode
            try:
                # Move season poster
                season_row = db.execute("""
                    SELECT s.id, s.poster FROM seasons s
                    JOIN episodes e ON e.season_id = s.id
                    WHERE e.id = ?
                """, (ep['ep_id'],)).fetchone()
                if season_row and season_row['poster']:
                    old_season_poster = Path(season_row['poster'])
                    if old_season_poster.exists():
                        new_season_poster = new_dir / 'poster.jpg'
                        if old_season_poster != new_season_poster:
                            if new_season_poster.exists():
                                try: old_season_poster.unlink()
                                except: pass
                            else:
                                os.rename(old_season_poster, new_season_poster)
                            db.execute("UPDATE seasons SET poster = ? WHERE id = ?", (str(new_season_poster), season_row['id']))

                # Move episode thumbnail
                ep_row = db.execute("SELECT thumbnail FROM episodes WHERE id = ?", (ep['ep_id'],)).fetchone()
                if ep_row and ep_row['thumbnail']:
                    old_ep_thumb = Path(ep_row['thumbnail'])
                    if old_ep_thumb.exists():
                        new_ep_thumb = new_dir / f"S{ep['season_number']:02d}E{ep['episode_number']:02d}-thumb.jpg"
                        if old_ep_thumb != new_ep_thumb:
                            if new_ep_thumb.exists():
                                try: old_ep_thumb.unlink()
                                except: pass
                            else:
                                os.rename(old_ep_thumb, new_ep_thumb)
                            db.execute("UPDATE episodes SET thumbnail = ? WHERE id = ?", (str(new_ep_thumb), ep['ep_id']))

                # Check for subtitles
                subs = db.execute("SELECT id, path FROM episode_subtitles WHERE episode_id = ?", (ep['ep_id'],)).fetchall()
                for sub in subs:
                    old_sub_path = Path(sub['path'])
                    if old_sub_path.exists():
                        final_ext = "".join(old_sub_path.suffixes)
                        
                        new_sub_path = new_dir / f"S{ep['season_number']:02d}E{ep['episode_number']:02d}{title_part}{final_ext}"
                        if old_sub_path != new_sub_path:
                            if new_sub_path.exists():
                                try: old_sub_path.unlink()
                                except: pass
                            else:
                                os.rename(old_sub_path, new_sub_path)
                            try:
                                db.execute("UPDATE episode_subtitles SET path = ? WHERE id = ?", (str(new_sub_path), sub['id']))
                            except sqlite3.IntegrityError:
                                # Duplicate subtitle record mapping to the same name, safely ignore
                                pass
            except Exception as e:
                print(f"  [!] ERROR: Could not process subtitles/artwork for {old_path.name}: {e}")

    # Cleanup empty directories and garbage - Bottom-up approach
    print(f"  [.] Cleaning up leftover empty directories and merged folders...")
    
    # 1. Map out all "Standard" paths that SHOULD exist according to the DB
    active_standard_paths = set()
    for s in series_list:
        year_str = f" ({s['year']})" if s['year'] else ""
        name = re.sub(r'[<>:"/\\|?*]', '_', f"{s['title']}{year_str}").strip()
        active_standard_paths.add(str(Path(SERIES_DIR) / name))

    # Get all subdirectories, sort by depth descending to ensure bottom-up
    all_dirs = sorted([p for p in Path(SERIES_DIR).rglob('*') if p.is_dir()], key=lambda x: len(x.parts), reverse=True)
    
    for p in all_dirs:
        # Avoid cleaning the root series directory
        if p == Path(SERIES_DIR): continue
        
        # Check if this directory belongs to a zombie series
        is_zombie = False
        try:
            parts = p.relative_to(SERIES_DIR).parts
            if parts:
                root_series_dir = Path(SERIES_DIR) / parts[0]
                if str(root_series_dir) not in active_standard_paths:
                    is_zombie = True
        except: pass

        clean_source_folder(p, aggressive=is_zombie)
        
        if p.exists() and not any(p.iterdir()):
            try:
                p.rmdir()
                print(f"    [-] Removed empty/merged dir: {p.relative_to(SERIES_DIR)}")
            except:
                pass

    db.commit()
    db.close()
    print(f"\nORGANIZE_COMPLETE: {renamed_files} files standardized. {skipped} skipped.")

def resolve_series_path(db: sqlite3.Connection, series_id: int, series_row: sqlite3.Row) -> Path:
    file_row = db.execute("""
        SELECT f.path FROM episode_files f
        JOIN episodes e ON f.episode_id = e.id
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ? LIMIT 1
    """, (series_id,)).fetchone()
    if file_row:
        try:
            rel = Path(file_row['path']).relative_to(SERIES_DIR)
            return Path(SERIES_DIR) / rel.parts[0]
        except Exception:
            return Path(file_row['path']).parent.parent
    year_str = f" ({series_row['year']})" if series_row['year'] else ""
    standard_series_name = re.sub(r'[<>:"/\\|?*]', '_', f"{series_row['title']}{year_str}").strip()
    return Path(SERIES_DIR) / standard_series_name

def resolve_series_thumbnail(series_path: Path, db: sqlite3.Connection, series_id: int) -> str | None:
    poster = series_path / 'poster.jpg'
    if poster.exists():
        return str(poster)

    seasons = db.execute(
        "SELECT season_number FROM seasons WHERE series_id = ? ORDER BY season_number ASC",
        (series_id,),
    ).fetchall()
    for s in seasons:
        season_poster = series_path / f"Season {s['season_number']:02d}" / 'poster.jpg'
        if season_poster.exists():
            return str(season_poster)

    episodes = db.execute("""
        SELECT s.season_number, e.episode_number
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ?
        ORDER BY s.season_number ASC, e.episode_number ASC
    """, (series_id,)).fetchall()
    for ep in episodes:
        sn, en = ep['season_number'], ep['episode_number']
        ep_thumb = series_path / f"Season {sn:02d}" / f"S{sn:02d}E{en:02d}-thumb.jpg"
        if ep_thumb.exists():
            return str(ep_thumb)

    return None

def series_has_local_artwork(series_path: Path, db: sqlite3.Connection, series_id: int) -> bool:
    return resolve_series_thumbnail(series_path, db, series_id) is not None

def episode_thumb_path(series_path: Path, season_num: int, ep_num: int) -> Path:
    return series_path / f"Season {season_num:02d}" / f"S{season_num:02d}E{ep_num:02d}-thumb.jpg"

def thumbnail_is_available(thumbnail: str | None, series_path: Path | None, season_num: int, ep_num: int) -> bool:
    if thumbnail:
        if thumbnail.startswith('http'):
            return True
        if Path(thumbnail).exists():
            return True
    if series_path:
        return episode_thumb_path(series_path, season_num, ep_num).exists()
    return False

def discover_local_artwork(db: sqlite3.Connection, series_id: int, series_row: sqlite3.Row) -> None:
    series_path = resolve_series_path(db, series_id, series_row)

    poster = series_path / 'poster.jpg'
    if poster.exists():
        if not series_row['thumbnail']:
            db.execute("UPDATE series SET thumbnail = ? WHERE id = ?", (str(poster), series_id))
    elif not series_row['thumbnail']:
        fallback = resolve_series_thumbnail(series_path, db, series_id)
        if fallback:
            db.execute("UPDATE series SET thumbnail = ? WHERE id = ?", (fallback, series_id))

    seasons = db.execute(
        "SELECT id, season_number, poster FROM seasons WHERE series_id = ?",
        (series_id,),
    ).fetchall()
    for s in seasons:
        if s['poster']:
            continue
        season_poster = series_path / f"Season {s['season_number']:02d}" / 'poster.jpg'
        if season_poster.exists():
            db.execute("UPDATE seasons SET poster = ? WHERE id = ?", (str(season_poster), s['id']))

    episodes = db.execute("""
        SELECT e.id, s.season_number, e.episode_number, e.thumbnail
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ?
    """, (series_id,)).fetchall()
    for ep in episodes:
        if ep['thumbnail']:
            continue
        sn, en = ep['season_number'], ep['episode_number']
        ep_thumb = episode_thumb_path(series_path, sn, en)
        if ep_thumb.exists():
            db.execute("UPDATE episodes SET thumbnail = ? WHERE id = ?", (str(ep_thumb), ep['id']))

def discover_all_local_artwork(db: sqlite3.Connection) -> None:
    for s in db.execute("SELECT * FROM series").fetchall():
        discover_local_artwork(db, s['id'], s)

def count_episode_thumbnail_stats(db: sqlite3.Connection) -> dict[str, int]:
    linked = on_disk = missing = 0
    for ser in db.execute("SELECT id FROM series").fetchall():
        series_row = db.execute("SELECT * FROM series WHERE id = ?", (ser['id'],)).fetchone()
        series_path = resolve_series_path(db, ser['id'], series_row)
        episodes = db.execute("""
            SELECT e.thumbnail, s.season_number, e.episode_number
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            WHERE s.series_id = ?
        """, (ser['id'],)).fetchall()
        for ep in episodes:
            thumb = ep['thumbnail']
            db_ok = thumb and (thumb.startswith('http') or Path(thumb).exists())
            disk_ok = series_path and episode_thumb_path(
                series_path, ep['season_number'], ep['episode_number']
            ).exists()
            if db_ok:
                linked += 1
            elif disk_ok:
                on_disk += 1
            else:
                missing += 1
    total = linked + on_disk + missing
    return {'total': total, 'linked': linked, 'on_disk': on_disk, 'missing': missing}

def format_thumbnail_stats(stats: dict[str, int]) -> str:
    total = stats['total']
    have = stats['linked'] + stats['on_disk']
    msg = f"{have}/{total} episodes have thumbnails ({stats['missing']} need download)"
    if stats['on_disk'] > 0:
        msg += f", {stats['on_disk']} on disk but not linked in DB"
    return msg

def download_episode_thumbnail(
    series_path: Path,
    season_num: int,
    ep_num: int,
    still_path: str | None,
    force: bool = False,
) -> str | None:
    dest = episode_thumb_path(series_path, season_num, ep_num)
    if dest.exists() and not force:
        return str(dest)
    if not still_path:
        return str(dest) if dest.exists() else None
    if download_poster(still_path, dest):
        return str(dest)
    return still_path

def list_missing_episodes(db: sqlite3.Connection) -> list[dict]:
    missing: list[dict] = []
    for ser in db.execute("SELECT id, title, tmdb_id FROM series ORDER BY title").fetchall():
        series_row = db.execute("SELECT * FROM series WHERE id = ?", (ser['id'],)).fetchone()
        series_path = resolve_series_path(db, ser['id'], series_row)
        episodes = db.execute("""
            SELECT e.thumbnail, s.season_number, e.episode_number
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            WHERE s.series_id = ?
            ORDER BY s.season_number, e.episode_number
        """, (ser['id'],)).fetchall()
        for ep in episodes:
            if thumbnail_is_available(
                ep['thumbnail'], series_path, ep['season_number'], ep['episode_number']
            ):
                continue
            if not ser['tmdb_id']:
                reason = 'no TMDB match'
            elif not API_KEY:
                reason = 'TMDB API key missing'
            else:
                reason = 'no still on TMDB or download failed'
            missing.append({
                'series': ser['title'],
                'season': ep['season_number'],
                'episode': ep['episode_number'],
                'tmdb_id': ser['tmdb_id'],
                'reason': reason,
            })
    return missing

def print_missing_report(db: sqlite3.Connection, limit: int = 25) -> int:
    missing = list_missing_episodes(db)
    if not missing:
        print("  [+] All episodes have thumbnails.")
        return 0

    print(f"  [!] {len(missing)} episodes still missing thumbnails:")
    by_series: dict[str, list[dict]] = {}
    for item in missing:
        by_series.setdefault(item['series'], []).append(item)

    shown = 0
    for series, items in sorted(by_series.items()):
        tmdb_id = items[0]['tmdb_id']
        reason = items[0]['reason']
        eps = ', '.join(f"S{item['season']:02d}E{item['episode']:02d}" for item in items[:8])
        suffix = f" +{len(items) - 8} more" if len(items) > 8 else ""
        tmdb_note = f"tmdb={tmdb_id}" if tmdb_id else "no tmdb_id"
        print(f"      {series} ({tmdb_note}, {reason}): {eps}{suffix}")
        shown += 1
        if shown >= limit:
            remaining = len(by_series) - limit
            if remaining > 0:
                print(f"      ... and {remaining} more series")
            break
    return len(missing)

def count_series_missing_episode_thumbnails(
    db: sqlite3.Connection, series_id: int, series_row: sqlite3.Row,
) -> int:
    series_path = resolve_series_path(db, series_id, series_row)
    missing = 0
    episodes = db.execute("""
        SELECT e.thumbnail, s.season_number, e.episode_number
        FROM episodes e
        JOIN seasons s ON e.season_id = s.id
        WHERE s.series_id = ?
    """, (series_id,)).fetchall()
    for ep in episodes:
        if not thumbnail_is_available(
            ep['thumbnail'], series_path, ep['season_number'], ep['episode_number']
        ):
            missing += 1
    return missing

def series_needs_scrape(db: sqlite3.Connection, series_id: int, series_row: sqlite3.Row, force: bool = False) -> bool:
    if force:
        return True
    if not series_row['plot']:
        return True
    if count_series_missing_episode_thumbnails(db, series_id, series_row) > 0:
        return True
    if not series_row['thumbnail']:
        series_path = resolve_series_path(db, series_id, series_row)
        if series_has_local_artwork(series_path, db, series_id):
            return False
        return True
    return False

def cmd_scrape(args):
    print(f"\n--- PHASE: Scraping Series Metadata ---")
    db = open_db()
    
    # Pre-flight check: Nullify broken thumbnail paths
    print(f"  [.] Checking for missing posters and thumbnails...")
    for table, col in [('series', 'thumbnail'), ('seasons', 'poster'), ('episodes', 'thumbnail')]:
        items = db.execute(f"SELECT id, {col} FROM {table}").fetchall()
        for item in items:
            thumb = item[col]
            if thumb and not thumb.startswith('http'):
                if not Path(thumb).exists():
                    db.execute(f"UPDATE {table} SET {col} = NULL WHERE id = ?", (item['id'],))
    db.commit()

    print(f"  [.] Discovering local artwork on disk...")
    discover_all_local_artwork(db)
    db.commit()

    series_list = db.execute("SELECT * FROM series").fetchall()
    scraped = 0
    skipped = 0
    total = len(series_list)
    stats_before = count_episode_thumbnail_stats(db)
    print(f"  [.] {total} series in library, {format_thumbnail_stats(stats_before)}")
    if not API_KEY:
        print("  [!] TMDB_API_KEY is not set — scrape cannot download missing artwork.")

    for i, s in enumerate(series_list, 1):
        series_id = s['id']
        s = db.execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
        if not series_needs_scrape(db, series_id, s, force=args.force):
            skipped += 1
            continue

        print(f"  [{i}/{total}] Scraping: {s['title']}")
        tmdb_id = s['tmdb_id']

        if API_KEY and not tmdb_id:
            res = tmdb_get('/search/tv', query=s['title'], first_air_date_year=s['year'])
            if res and res.get('results'):
                tv = res['results'][0]
                tmdb_id = tv.get('id')
                db.execute("UPDATE series SET tmdb_id=? WHERE id=?", (tmdb_id, series_id))
                time.sleep(DELAY)

        if API_KEY and tmdb_id:
            try:
                details = tmdb_get(f'/tv/{tmdb_id}', append_to_response='credits')
                plot = details.get('overview')
                rating = details.get('vote_average')
                genres = ', '.join([g['name'] for g in details.get('genres', [])]) or None
                
                crew = details.get('credits', {}).get('crew', [])
                director = next((c['name'] for c in crew if c.get('job') == 'Director' or c.get('job') == 'Executive Producer'), None)
                
                genre_names = [g['name'] for g in details.get('genres', [])]
                audience = 'family' if any(g in genre_names for g in ('Animation', 'Family', 'Kids')) else None
                
                standard_series_path = resolve_series_path(db, series_id, s)

                poster_src = details.get('poster_path')
                thumbnail = s['thumbnail']

                if args.force:
                    if poster_src:
                        poster_path = standard_series_path / 'poster.jpg'
                        if download_poster(poster_src, poster_path):
                            thumbnail = str(poster_path)
                        else:
                            thumbnail = poster_src
                else:
                    local_thumb = resolve_series_thumbnail(standard_series_path, db, series_id)
                    if local_thumb:
                        thumbnail = local_thumb
                    elif poster_src:
                        poster_path = standard_series_path / 'poster.jpg'
                        if download_poster(poster_src, poster_path):
                            thumbnail = str(poster_path)
                        else:
                            thumbnail = poster_src
                
                db.execute("""
                    UPDATE series 
                    SET plot=?, rating=?, genres=?, director=?, audience=?, thumbnail=?
                    WHERE id=?
                """, (plot, rating, genres, director, audience, thumbnail, series_id))
                
                # Scrape seasons and episodes
                abs_index = build_tmdb_absolute_index(tmdb_id)
                seasons_db = db.execute("SELECT * FROM seasons WHERE series_id = ?", (series_id,)).fetchall()
                for s_db in seasons_db:
                    season_num = s_db['season_number']
                    s_details = tmdb_get(f'/tv/{tmdb_id}/season/{season_num}')
                    if not s_details:
                        print(f"    [!] TMDB returned no data for season {season_num}")
                        continue

                    s_title = s_details.get('name')
                    s_plot = s_details.get('overview')
                    s_poster = s_details.get('poster_path')
                    
                    s_poster_local = None
                    season_folder_name = f"Season {season_num:02d}"
                    if s_poster:
                        s_poster_path = standard_series_path / season_folder_name / 'poster.jpg'
                        if args.force or not s_poster_path.exists():
                            if download_poster(s_poster, s_poster_path):
                                s_poster_local = str(s_poster_path)
                            else:
                                s_poster_local = s_poster
                        else:
                            s_poster_local = str(s_poster_path)
                            
                    db.execute("UPDATE seasons SET title=?, plot=?, poster=? WHERE id=?", (s_title, s_plot, s_poster_local, s_db['id']))

                    tmdb_eps = {
                        ep_data.get('episode_number'): ep_data
                        for ep_data in s_details.get('episodes', [])
                        if ep_data.get('episode_number') is not None
                    }
                    db_eps = db.execute(
                        "SELECT episode_number FROM episodes WHERE season_id = ?",
                        (s_db['id'],),
                    ).fetchall()

                    for ep_row in db_eps:
                        ep_num = ep_row['episode_number']
                        ep_data = tmdb_eps.get(ep_num, {})
                        if not ep_data.get('still_path') and abs_index:
                            abs_num = compute_absolute_episode(db, series_id, season_num, ep_num)
                            ep_data = abs_index.get(abs_num, ep_data)
                        ep_title = ep_data.get('name')
                        ep_plot = ep_data.get('overview')
                        ep_runtime = ep_data.get('runtime')
                        ep_still = ep_data.get('still_path')
                        ep_thumb_local = download_episode_thumbnail(
                            standard_series_path, season_num, ep_num, ep_still, force=args.force
                        )

                        db.execute("""
                            UPDATE episodes 
                            SET title=COALESCE(?, title),
                                plot=COALESCE(?, plot),
                                runtime=COALESCE(?, runtime),
                                thumbnail=COALESCE(?, thumbnail)
                            WHERE season_id=? AND episode_number=?
                        """, (ep_title, ep_plot, ep_runtime, ep_thumb_local, s_db['id'], ep_num))
                    time.sleep(DELAY)

                discover_local_artwork(db, series_id, s)
                scraped += 1
                time.sleep(DELAY)
            except Exception as e:
                print(f"    [!] Error scraping {s['title']}: {e}")
        elif not tmdb_id:
            print(f"    [!] No TMDB match for {s['title']} — episode thumbnails cannot be downloaded automatically")
        else:
            print(f"    [!] Skipped {s['title']} — set TMDB_API_KEY to download artwork")

    print(f"  [.] Re-linking local artwork...")
    discover_all_local_artwork(db)
    db.commit()
    stats_after = count_episode_thumbnail_stats(db)
    remaining = print_missing_report(db)
    db.commit()
    db.close()
    print(f"SCRAPE_COMPLETE:")
    print(f"  - Series scraped: {scraped}")
    print(f"  - Series skipped: {skipped}")
    print(f"  - Thumbnails: {format_thumbnail_stats(stats_before)} -> {format_thumbnail_stats(stats_after)}")
    if remaining:
        print(f"  - Action: fix the {remaining} remaining episodes manually or assign a TMDB ID in admin")

def cmd_audit(args):
    print(f"\n--- PHASE: Thumbnail Audit ---")
    db = open_db()
    discover_all_local_artwork(db)
    db.commit()
    total_series = db.execute("SELECT COUNT(*) AS n FROM series").fetchone()['n']
    stats = count_episode_thumbnail_stats(db)
    print(f"  [.] {total_series} series, {format_thumbnail_stats(stats)}")
    remaining = print_missing_report(db)
    db.close()
    if remaining:
        sys.exit(1)

def cmd_full(args):
    print(f"\n==========================================")
    print(f"   MirrorMessiah Series: FULL SYSTEM INTEGRATION")
    print(f"==========================================\n")
    
    cmd_sync(args)
    cmd_cleanup(args)
    cmd_organize(args)
    cmd_scrape(args)
    
    print(f"\n==========================================")
    print(f"   INTEGRATION COMPLETE")
    print(f"==========================================\n")

def main():
    parser = argparse.ArgumentParser(prog='series_cli', description='MirrorMessiah Series CLI')
    sub = parser.add_subparsers(dest='command', required=True)
    
    p_sync = sub.add_parser('sync', help='Ingest new series')
    p_sync.add_argument('dir', nargs='?', default=SERIES_DIR)
    
    p_organize = sub.add_parser('organize', help='Reflect Database structure to physical folder names on disk')
    
    p_cleanup = sub.add_parser('cleanup', help='Fix DB titles and merge duplicates')
    
    p_scrape = sub.add_parser('scrape', help='Scrape missing TMDB metadata for series')
    p_scrape.add_argument('--force', action='store_true', help='Force re-scrape of all series')

    sub.add_parser('audit', help='Report episode thumbnails still missing after disk scan')

    p_full = sub.add_parser('full', help='Complete pipeline: Sync -> Cleanup -> Organize -> Scrape')
    p_full.add_argument('dir', nargs='?', default=SERIES_DIR)
    p_full.add_argument('--force', action='store_true', help='Force re-scrape')

    args = parser.parse_args()
    if hasattr(args, 'force') is False:
        args.force = False

    if args.command == 'sync': cmd_sync(args)
    elif args.command == 'organize': cmd_organize(args)
    elif args.command == 'cleanup': cmd_cleanup(args)
    elif args.command == 'scrape': cmd_scrape(args)
    elif args.command == 'audit': cmd_audit(args)
    elif args.command == 'full': cmd_full(args)

if __name__ == '__main__':
    main()
