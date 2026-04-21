#!/usr/bin/env python3
import os
import re
import sqlite3
import logging
import shutil
import sys
import requests
import time
from pathlib import Path
from typing import Optional, List, Tuple
import typer
from datetime import datetime

app = typer.Typer(help="MirrorMessiah CLI - The Great Archive Synchronizer")

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".wmv"}
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = PROJECT_ROOT / "media.db"
POSTER_PATH = PROJECT_ROOT / "web/public/posters"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.row_factory = sqlite3.Row
    return conn

def clean_movie_name(name: str) -> str:
    """Surgically strip technical noise and empty shells to find the Pure Title."""
    if not name: return ""
    name = Path(name).stem
    
    # 1. Aggressive Noise & Technical Pattern Purge
    tech_patterns = [
        r"\[.*?\]", r"\(.*?\)", # Remove everything in brackets/parens first
        r"\d{4}p", r"\d{3}p", r"2160p", r"4k", r"bluray", r"web-dl", r"webrip", r"brrip", r"hdtv",
        r"x264", r"x265", r"hevc", r"aac", r"dts", r"dd5\.1", r"ddp5\.1", r"5\.1", r"5\s1", 
        r"ac3", r"yts", r"yify", r"remastered", r"extended", r"directors\.cut", r"10bit", 
        r"hdr", r"atmos", r"dv", r"dvdrip", r"v2", r"hdts", r"av1", r"multi", r"dual", 
        r"latino", r"subs", r"h\.\d{3}", r"h264", r"h265", r"WEB", r"AMZN", r"NF", r"DSNP"
    ]
    for pattern in tech_patterns:
        name = re.sub(rf"\b{pattern}\b", " ", name, flags=re.IGNORECASE)

    # 2. Strip Years (Any 4-digit number that looks like a year, 18xx-29xx)
    name = re.sub(r"\b(18|19|20|21|29)\d{2}\b", " ", name)

    # 3. Clean up formatting symbols
    name = name.replace(".", " ").replace("_", " ").replace("-", " ")
    
    # 4. Final Purge of ANY remaining brackets or empty parens
    name = re.sub(r"[\(\)\[\]]", " ", name)
    
    # 5. Final Normalization
    name = re.sub(r"\s+", " ", name)
    return name.strip()

def get_yts_metadata(title: str, year: Optional[int] = None) -> Optional[dict]:
    """Infiltrate YTS mirrors for metadata using rotation."""
    mirrors = ["https://yts.mx", "https://yts.rs", "https://yts.do", "https://yify-backend.onrender.com"]
    search_terms = [f"{title} {year}" if year else title, title]
    for term in search_terms:
        for mirror in mirrors:
            try:
                r = requests.get(f"{mirror}/api/v2/list_movies.json", params={"query_term": term, "limit": 5}, timeout=10, headers=HEADERS)
                res = r.json()
                if res.get("status") == "ok" and res.get("data", {}).get("movie_count", 0) > 0:
                    movies = res["data"]["movies"]
                    best = movies[0]
                    if year:
                        for m in movies:
                            if m.get("year") == year: return m
                    return best
            except Exception: continue
    return None

@app.command("cleanup")
def cleanup():
    """Identify and merge duplicate movie entries and purge noise from existing titles."""
    conn = get_db()
    logging.info("Initiating Great Registry Purge...")
    movies = conn.execute("SELECT id, title, year FROM movies").fetchall()
    seen = {} # (title_norm, year) -> primary_id
    merged_count = 0
    for m in movies:
        pure_title = clean_movie_name(m["title"])
        norm_key = (pure_title.lower(), m["year"])
        if norm_key in seen:
            primary_id = seen[norm_key]
            conn.execute("UPDATE files SET movie_id = ? WHERE movie_id = ?", (primary_id, m["id"]))
            conn.execute("UPDATE subtitles SET movie_id = ? WHERE movie_id = ?", (primary_id, m["id"]))
            conn.execute("DELETE FROM movies WHERE id = ?", (m["id"],))
            merged_count += 1
        else:
            seen[norm_key] = m["id"]
            conn.execute("UPDATE movies SET title = ? WHERE id = ?", (pure_title, m["id"]))
    conn.commit()
    conn.close()
    logging.info(f"Purge Complete. Merged {merged_count} duplicate entities. All titles sanitized.")

@app.command("sync")
def sync(root_path: str = typer.Argument(..., help="Path to the media treasury")):
    """The Great Synchronizer: Scan, Clean, and Enrich without duplicates."""
    root = Path(root_path)
    if not root.exists(): return
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS libraries(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, root_path TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS movies(id INTEGER PRIMARY KEY, title TEXT NOT NULL, year INTEGER, quality TEXT, imdb_id TEXT UNIQUE, thumbnail TEXT, plot TEXT, rating REAL, genres TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, library_id INTEGER REFERENCES libraries(id), movie_id INTEGER REFERENCES movies(id), path TEXT NOT NULL UNIQUE, size_bytes INTEGER, container TEXT);
        CREATE TABLE IF NOT EXISTS subtitles(id INTEGER PRIMARY KEY, movie_id INTEGER REFERENCES movies(id), path TEXT NOT NULL UNIQUE, lang TEXT);
    """)
    conn.execute("INSERT OR IGNORE INTO libraries (name, root_path) VALUES ('Main_Treasury', ?)", (str(root.absolute()),))
    lib_id = conn.execute("SELECT id FROM libraries WHERE name = 'Main_Treasury'").fetchone()["id"]
    POSTER_PATH.mkdir(parents=True, exist_ok=True)
    movie_dirs = [d for d in root.iterdir() if d.is_dir() and not d.name.startswith(".")]
    logging.info(f"Syncing {len(movie_dirs)} folders...")

    for i, movie_dir in enumerate(sorted(movie_dirs)):
        raw_name = movie_dir.name
        year_match = re.search(r"\b(19|20)\d{2}\b", raw_name)
        year = int(year_match.group()) if year_match else None
        pure_title = clean_movie_name(raw_name)
        if year: pure_title = pure_title.replace(str(year), "").strip()
        
        # FIND OR CREATE MOVIE
        existing = conn.execute("SELECT id, thumbnail, plot FROM movies WHERE LOWER(title) = LOWER(?) AND (year = ? OR year IS NULL)", (pure_title, year)).fetchone()
        
        m_id = None
        if not existing:
            quality_match = re.search(r"\b(1080p|720p|4K|2160p)\b", raw_name, re.IGNORECASE)
            quality = quality_match.group().upper() if quality_match else "HD"
            conn.execute("INSERT INTO movies (title, year, quality) VALUES (?, ?, ?)", (pure_title, year, quality))
            m_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            needs_enrichment = True
        else:
            m_id = existing["id"]
            needs_enrichment = not existing["thumbnail"] or not existing["plot"]

        # ENRICHMENT BLOCK
        if needs_enrichment:
            thumbnail_path = None
            # 1. LOCAL POSTER SCAN
            image_exts = {".jpg", ".jpeg", ".png", ".webp"}
            common_names = {"poster", "cover", "folder", "thumb", pure_title.lower()}
            for img in movie_dir.iterdir():
                if img.suffix.lower() in image_exts and any(c in img.name.lower() for c in common_names):
                    try:
                        filename = f"movie_{m_id}{img.suffix}"
                        shutil.copy(img, POSTER_PATH / filename)
                        thumbnail_path = f"posters/{filename}"
                        logging.info(f"  → Local Poster Secured: {img.name}")
                        break
                    except Exception: pass
            
            # 2. REMOTE METADATA INFILTRATION
            meta = get_yts_metadata(pure_title, year)
            if meta:
                plot = meta.get("description_full")
                rating = meta.get("rating")
                genres = ", ".join(meta.get("genres", []))
                imdb = meta.get("imdb_code")
                
                if not thumbnail_path:
                    poster_url = meta.get("large_cover_image")
                    if poster_url:
                        for img_url in [poster_url, poster_url.replace("img.yts.mx", "img.yts.do")]:
                            try:
                                img_r = requests.get(img_url, timeout=10, headers=HEADERS)
                                if img_r.status_code == 200:
                                    filename = f"movie_{m_id}.jpg"
                                    with open(POSTER_PATH / filename, "wb") as f: f.write(img_r.content)
                                    thumbnail_path = f"posters/{filename}"
                                    logging.info(f"  → Remote Poster Secured")
                                    break
                            except Exception: continue

                conn.execute("UPDATE movies SET plot = ?, rating = ?, genres = ?, imdb_id = ?, thumbnail = ? WHERE id = ?",
                             (plot, rating, genres, imdb, thumbnail_path, m_id))

        # ALWAYS INDEX FILES
        for file in movie_dir.rglob("*"):
            ext = file.suffix.lower()
            if ext in VIDEO_EXTENSIONS:
                conn.execute("INSERT OR IGNORE INTO files (library_id, movie_id, path, size_bytes, container) VALUES (?, ?, ?, ?, ?)", (lib_id, m_id, str(file.absolute()), file.stat().st_size, ext[1:]))
            elif ext in {".srt", ".vtt"}:
                lang = "spa" if any(x in file.name.lower() for x in ["spa", "es", "spanish"]) else "eng"
                conn.execute("INSERT OR IGNORE INTO subtitles (movie_id, path, lang) VALUES (?, ?, ?)", (m_id, str(file.absolute()), lang))
        
        conn.commit()
        if i % 10 == 0: logging.info(f"Progress: {i+1}/{len(movie_dirs)}")

    conn.close()
    logging.info("Sync Protocol Finalized.")

if __name__ == "__main__":
    app()
