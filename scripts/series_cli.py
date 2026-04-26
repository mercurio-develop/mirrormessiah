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
SERIES_DIR = '/media/tushita/TUSHITA_W11_DATA/series/'
TMDB_BASE = 'https://api.themoviedb.org/3'
DELAY     = 0.25
VIDEO_EXT = {'.mp4', '.mkv', '.avi'}
SUB_EXT   = {'.srt', '.vtt', '.ass', '.ssa'}

# Regex for "S01E05" or "1x05"
EPISODE_RE = re.compile(r'S(?P<season>\d+)\s*E(?P<episode>\d+)|(?P<season2>\d+)x(?P<episode2>\d+)', re.IGNORECASE)

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
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    _ensure_tables(db)
    return db

def get_library_id(db: sqlite3.Connection) -> int:
    row = db.execute('SELECT id FROM libraries LIMIT 1').fetchone()
    if row:
        return row['id']
    cur = db.execute("INSERT INTO libraries (name, root_path) VALUES ('Default', '/')")
    db.commit()
    return cur.lastrowid

def clean_name(name: str) -> str:
    name = Path(name).stem
    name = re.sub(r'[\(\)\[\]]', ' ', name)
    name = re.sub(r'\b(19|20)\d{2}\b', '', name)
    return re.sub(r'\s+', ' ', name).strip()

def extract_year(name: str) -> int | None:
    match = re.search(r'\b(19|20)\d{2}\b', name)
    return int(match.group()) if match else None

def extract_episode_info(name: str, parent_name: str):
    # 1. Try standard S01E01 or 1x01
    m = EPISODE_RE.search(name)
    if m:
        season = int(m.group('season') or m.group('season2'))
        ep = int(m.group('episode') or m.group('episode2'))
        return season, ep

    # 2. Try to find an episode number with a common prefix: E01, EP01, Episode 01, _ep01, - E01, OVA - E1
    ep_num = None
    ep_match = re.search(r'(?:[_\-\s](?:E|EP|Episode)\s*0*(\d+))', name, re.IGNORECASE)
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
            
    db.close()
    print("SYNC_COMPLETE")

def cmd_organize(args):
    print(f"\n--- INITIATING FILESYSTEM REORGANIZATION (SERIES) ---")
    db = open_db()
    series_list = db.execute("SELECT id, title, year FROM series").fetchall()
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

        episodes = db.execute("""
            SELECT e.id as ep_id, e.episode_number, s.season_number, f.id as file_id, f.path
            FROM episodes e
            JOIN seasons s ON e.season_id = s.id
            JOIN episode_files f ON f.episode_id = e.id
            WHERE s.series_id = ?
        """, (series_id,)).fetchall()

        if not episodes: continue

        for ep in episodes:
            old_path = Path(ep['path'])
            if not old_path.exists(): continue

            # Standardized path: Series (Year)/Season 01/S01E05.ext
            season_folder_name = f"Season {ep['season_number']:02d}"
            standard_file_name = f"S{ep['season_number']:02d}E{ep['episode_number']:02d}{old_path.suffix}"
            
            new_dir = standard_series_path / season_folder_name
            new_path = new_dir / standard_file_name

            if old_path == new_path:
                continue # Already organized

            if new_path.exists():
                print(f"  [!] CONFLICT: '{new_path.name}' already exists. Skipping.")
                skipped += 1
                continue

            try:
                new_dir.mkdir(parents=True, exist_ok=True)
                os.rename(old_path, new_path)
                
                # Update DB
                db.execute("UPDATE episode_files SET path = ? WHERE id = ?", (str(new_path), ep['file_id']))
                
                # Check for subtitles
                subs = db.execute("SELECT id, path FROM episode_subtitles WHERE episode_id = ?", (ep['ep_id'],)).fetchall()
                for sub in subs:
                    old_sub_path = Path(sub['path'])
                    if old_sub_path.exists():
                        # Preserve language code if present (e.g., .en.srt)
                        sub_exts = old_sub_path.suffixes
                        # Keep at most the last two suffixes if it looks like a language code (.en.srt)
                        if len(sub_exts) >= 2 and len(sub_exts[-2]) <= 4:
                             final_ext = f"{sub_exts[-2]}{sub_exts[-1]}"
                        else:
                             final_ext = old_sub_path.suffix
                        
                        new_sub_path = new_dir / f"S{ep['season_number']:02d}E{ep['episode_number']:02d}{final_ext}"
                        os.rename(old_sub_path, new_sub_path)
                        db.execute("UPDATE episode_subtitles SET path = ? WHERE id = ?", (str(new_sub_path), sub['id']))
                
                print(f"  [rename] '{old_path.name}' -> '{new_dir.parent.name}/{new_dir.name}/{new_path.name}'")
                renamed_files += 1

            except Exception as e:
                print(f"  [!] ERROR: Could not rename {old_path.name}: {e}")

    # Cleanup empty directories
    for p in Path(SERIES_DIR).rglob('*'):
        if p.is_dir() and not any(p.iterdir()):
            try: p.rmdir()
            except: pass

    db.commit()
    db.close()
    print(f"\nORGANIZE_COMPLETE: {renamed_files} files standardized. {skipped} skipped.")

def main():
    parser = argparse.ArgumentParser(prog='series_cli', description='MirrorMessiah Series CLI')
    sub = parser.add_subparsers(dest='command', required=True)
    
    p_sync = sub.add_parser('sync', help='Ingest new series')
    p_sync.add_argument('dir', nargs='?', default=SERIES_DIR)
    
    p_organize = sub.add_parser('organize', help='Reflect Database structure to physical folder names on disk')
    
    args = parser.parse_args()
    if args.command == 'sync': cmd_sync(args)
    elif args.command == 'organize': cmd_organize(args)

if __name__ == '__main__':
    main()
