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
EPISODE_RE = re.compile(r'S(?P<season>\d+)E(?P<episode>\d+)|(?P<season2>\d+)x(?P<episode2>\d+)', re.IGNORECASE)

def open_db() -> sqlite3.Connection:
    if not Path(DB_PATH).exists():
        print(f'ERROR: DB not found: {DB_PATH}')
        sys.exit(1)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
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

def extract_episode_info(name: str):
    m = EPISODE_RE.search(name)
    if m:
        season = int(m.group('season') or m.group('season2'))
        ep = int(m.group('episode') or m.group('episode2'))
        return season, ep
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
            season_num, ep_num = extract_episode_info(ep_file.name)
            if season_num is None: 
                # Try from parent folder name like "Season 1"
                m = re.search(r'Season\s*(\d+)', ep_file.parent.name, re.I)
                if m:
                    season_num = int(m.group(1))
                    
                    # Try to extract episode just by digits if possible e.g., "01 - Pilot"
                    em = re.search(r'(\d+)', ep_file.name)
                    if em:
                        ep_num = int(em.group(1))

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

def main():
    parser = argparse.ArgumentParser(prog='series_cli', description='MirrorMessiah Series CLI')
    sub = parser.add_subparsers(dest='command', required=True)
    
    p_sync = sub.add_parser('sync', help='Ingest new series')
    p_sync.add_argument('dir', nargs='?', default=SERIES_DIR)
    
    args = parser.parse_args()
    if args.command == 'sync': cmd_sync(args)

if __name__ == '__main__':
    main()
