import sqlite3
import os
import shutil
from pathlib import Path
import re
import subprocess
import time
import json
import argparse
import sys
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote

def get_video_metadata(file_path):
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

def parse_metadata(text):
    patterns = [
        (r'^(.*?)\s+\((\d{4})\)\s+\[([^\]]+)\]', 1, 2, 3),
        (r'^(.+?)\.(\d{4})\.(.+)', 1, 2, 3),
        (r'^(.*?)\s+\((\d{4})\)', 1, 2, None),
        (r'^(.*?)\s+\[([^\]]+)\]', 1, None, 2),
    ]

    for pattern, t_idx, y_idx, q_idx in patterns:
        match = re.match(pattern, text.strip(), re.IGNORECASE)
        if match:
            title = match.group(t_idx).replace('.', ' ').strip()
            year = int(match.group(y_idx)) if y_idx and match.group(y_idx) else None
            quality = match.group(q_idx).strip() if q_idx and match.group(q_idx) else "Unknown"
            
            if quality != "Unknown":
                q_match = re.search(r'\b(2160p|1080p|720p|4k|uhd)\b', quality, re.IGNORECASE)
                if q_match:
                    q = q_match.group(1).lower()
                    if q in ['2160p', 'uhd', '4k']:
                        quality = '4K'
                    else:
                        quality = q
                elif '.' in quality or '-' in quality:
                    quality = quality.replace('.', ' ').split('-')[0].strip()

            return title, year, quality

    return text.strip().replace('.', ' '), None, "Unknown"

class MessiahManager:
    def __init__(self, db_path):
        self.db_path = Path(db_path)
        self.conn = sqlite3.connect(str(self.db_path), timeout=60)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        self._ensure_schema()

    def _ensure_schema(self):
        self.cursor.executescript("""
            CREATE TABLE IF NOT EXISTS libraries(
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                root_path TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS movies(
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                year INTEGER,
                quality TEXT,
                imdb_id TEXT UNIQUE,
                tmdb_id INTEGER UNIQUE,
                thumbnail TEXT,
                plot TEXT,
                rating REAL,
                genres TEXT,
                audience TEXT CHECK(audience IN ('family', 'adult')) DEFAULT NULL,
                needs_repair BOOLEAN DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS files(
                id INTEGER PRIMARY KEY,
                library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                size_bytes INTEGER,
                container TEXT,
                original_path TEXT,
                fallback_mp4_path TEXT,
                has_mp4_fallback BOOLEAN DEFAULT 0,
                added_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(library_id, path)
            );

            CREATE TABLE IF NOT EXISTS subtitles(
                id INTEGER PRIMARY KEY,
                movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                lang TEXT,
                format TEXT,
                added_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        self.conn.commit()

    def scan(self, root_path, library_name="Main_Registry"):
        print(f"\n--- SCANNING SECTOR: {root_path} ---")
        root = Path(root_path)
        if not root.exists():
            print(f"ERROR: Path {root_path} not found.")
            return

        self.cursor.execute("INSERT OR IGNORE INTO libraries (name, root_path) VALUES (?, ?)", (library_name, str(root.absolute())))
        self.cursor.execute("SELECT id FROM libraries WHERE name = ?", (library_name,))
        lib_id = self.cursor.fetchone()[0]

        video_extensions = {'.mkv', '.mp4', '.avi', '.mov', '.m4v', '.webm'}
        found_count = 0
        skip_quality = re.compile(r'2160p|4K|UHD|BLURAY|BRRIP|BDRIP', re.IGNORECASE)

        for folder in root.rglob('*'):
            if folder.is_dir() and folder != root:
                videos = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in video_extensions]
                if not videos: continue

                if skip_quality.search(folder.name):
                    # Workaround: allow BLURAY/BRRIP if it's 1080p and contains a .mp4 file
                    if re.search(r'BLURAY|BRRIP|BDRIP', folder.name, re.IGNORECASE) and re.search(r'1080p', folder.name, re.IGNORECASE):
                        if not any(f.suffix.lower() == '.mp4' for f in videos):
                            print(f"  [SKIP] Quality filter (No 1080p MP4): {folder.name}")
                            continue
                    else:
                        print(f"  [SKIP] Quality filter: {folder.name}")
                        continue

                title, year, quality = parse_metadata(folder.name)
                
                self.cursor.execute("SELECT id FROM movies WHERE title = ? AND year IS ?", (title, year))
                row = self.cursor.fetchone()
                if row:
                    movie_id = row[0]
                else:
                    self.cursor.execute("INSERT INTO movies (title, year, quality) VALUES (?, ?, ?)", (title, year, quality))
                    movie_id = self.cursor.lastrowid

                for v in videos:
                    self.cursor.execute("INSERT OR IGNORE INTO files (library_id, movie_id, path, size_bytes, container) VALUES (?, ?, ?, ?, ?)",
                                      (lib_id, movie_id, str(v.absolute()), v.stat().st_size, v.suffix[1:].lower()))
                    if self.cursor.rowcount > 0: found_count += 1

                sub_extensions = {'.srt', '.vtt'}
                subs = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in sub_extensions]
                for s in subs:
                    self.cursor.execute("INSERT OR IGNORE INTO subtitles (movie_id, path, format) VALUES (?, ?, ?)",
                                      (movie_id, str(s.absolute()), s.suffix[1:].lower()))

        self.conn.commit()
        print(f"SCAN_COMPLETE: {found_count} new files indexed.")

    def cleanup(self):
        print("
--- INITIATING DUPLICATE PURGE ---")
        self.cursor.execute("""
            CREATE TEMP TABLE movie_mapping AS
            WITH ranked AS (
                SELECT id, title, year,
                ROW_NUMBER() OVER (PARTITION BY title, year ORDER BY (SELECT COUNT(*) FROM files WHERE movie_id = movies.id) DESC, id ASC) as rank
                FROM movies
            )
            SELECT r.id as old_id, k.id as new_id
            FROM ranked r
            JOIN (SELECT id, title, year FROM ranked WHERE rank = 1) k ON r.title = k.title AND (r.year = k.year OR (r.year IS NULL AND k.year IS NULL))
            WHERE r.rank > 1
        """)
        
        mapping = self.cursor.execute("SELECT old_id, new_id FROM movie_mapping").fetchall()
        for old_id, new_id in mapping:
            self.cursor.execute("UPDATE OR IGNORE files SET movie_id = ? WHERE movie_id = ?", (new_id, old_id))
            self.cursor.execute("UPDATE OR IGNORE subtitles SET movie_id = ? WHERE movie_id = ?", (new_id, old_id))
            self.cursor.execute("DELETE FROM movies WHERE id = ?", (old_id,))
        
        self.conn.commit()
        print(f"PURGE_COMPLETE: {len(mapping)} redundant entities removed.")

    def sync(self, strict=True):
        print("
--- SYNCING ASSETS (STRICT_MODE: {}) ---".format(strict))
        movies = self.cursor.execute("SELECT * FROM movies").fetchall()
        
        purged = 0
        linked = 0
        img_exts = {'.jpg', '.jpeg', '.png', '.webp'}
        exclude_patterns = ['YTS', 'YIFY', 'OFFICIAL SITE', 'PROXIES', 'WWW.']

        for movie in movies:
            mid = movie['id']
            files = self.cursor.execute("SELECT * FROM files WHERE movie_id = ?", (mid,)).fetchall()
            valid_files = []
            quality = None

            for f in files:
                path = Path(f['path'])
                if strict:
                    if path.suffix.lower() != '.mp4' or not path.exists(): continue
                    meta = get_video_metadata(f['path'])
                    if not meta or meta['height'] > 1080: continue
                    quality = meta['quality']
                else:
                    if not path.exists(): continue
                valid_files.append(f)

            if not valid_files:
                self.cursor.execute("DELETE FROM movies WHERE id = ?", (mid,))
                purged += 1
                continue

            if quality:
                self.cursor.execute("UPDATE movies SET quality = ? WHERE id = ?", (quality, mid))

            # Poster
            movie_dir = Path(valid_files[0]['path']).parent
            images = [p for p in movie_dir.iterdir() if p.is_file() and p.suffix.lower() in img_exts]
            clean = [p for p in images if not any(pat in p.name.upper() for pat in exclude_patterns)]
            clean.sort(key=lambda p: (0 if p.stem.lower() == 'poster' else 1 if 'poster' in p.name.lower() else 2))
            
            if clean:
                source = clean[0]
                target = movie_dir / f"poster{source.suffix.lower()}"
                try:
                    if source != target:
                        if target.exists(): os.remove(target)
                        os.rename(source, target)
                    self.cursor.execute("UPDATE movies SET thumbnail = ? WHERE id = ?", (str(target.absolute()), mid))
                    linked += 1
                except: pass
            else:
                self.cursor.execute("UPDATE movies SET thumbnail = NULL WHERE id = ?", (mid,))

        self.conn.commit()
        print(f"SYNC_COMPLETE: {linked} posters linked, {purged} non-compliant movies purged.")

    def scrape(self, force=False):
        print("
--- INITIATING YTS_INTELLIGENCE_SCRAPE ---")
        query = "SELECT id, title, year FROM movies"
        if not force:
            query += " WHERE plot IS NULL OR rating IS NULL OR genres IS NULL"
        
        movies = self.cursor.execute(query).fetchall()
        print(f"TARGET_LOAD: {len(movies)} entities needing data enrichment.")
        
        scraped_count = 0
        domains = ["https://yts.rs", "https://yts.mx", "https://yts.pm"]
        
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        
        for movie in movies:
            mid = movie['id']
            title = movie['title']
            year = movie['year']
            
            print(f"  [?] IDENTIFYING: {title} ({year})")
            
            success = False
            for base_url in domains:
                try:
                    search_url = f"{base_url}/browse-movies/{quote(title)}/all/all/0/latest/0/all"
                    res = requests.get(search_url, headers=headers, timeout=10)
                    if res.status_code != 200: continue
                    
                    soup = BeautifulSoup(res.text, 'html.parser')
                    movie_cards = soup.select('.browse-movie-wrap')
                    
                    best_match_url = None
                    for card in movie_cards:
                        card_title_el = card.select_one('.browse-movie-title') or card.select_one('a.title')
                        if not card_title_el: continue
                        
                        card_title = card_title_el.text.strip()
                        card_year_el = card.select_one('.browse-movie-year') or card.select_one('div.year')
                        card_year = card_year_el.text.strip() if card_year_el else ""
                        
                        if card_title.lower() == title.lower():
                            if not year or card_year == str(year):
                                best_match_url = card_title_el['href']
                                if not best_match_url.startswith('http'):
                                    best_match_url = base_url + best_match_url
                                break
                    
                    if not best_match_url and movie_cards:
                        card_title_el = movie_cards[0].select_one('.browse-movie-title') or movie_cards[0].select_one('a.title')
                        if card_title_el:
                            best_match_url = card_title_el['href']
                            if not best_match_url.startswith('http'):
                                best_match_url = base_url + best_match_url

                    if best_match_url:
                        movie_res = requests.get(best_match_url, headers=headers, timeout=10)
                        if movie_res.status_code == 200:
                            m_soup = BeautifulSoup(movie_res.text, 'html.parser')
                            
                            # Rating
                            rating_el = m_soup.select_one('span[itemprop="ratingValue"]') or m_soup.select_one('.rating')
                            rating = None
                            if rating_el:
                                try: rating = float(rating_el.text.split('/')[0].strip())
                                except: pass
                            
                            # Genre
                            genres = [g.text.strip() for g in m_soup.select('.genre') or m_soup.select('h2 span')]
                            genre_text = ", ".join(genres) if genres else ""
                            
                            # Plot
                            plot_el = m_soup.select_one('#movie-synopsis p') or m_soup.select_one('div#synopsis p') or m_soup.select_one('.synopsis p')
                            plot_text = plot_el.text.strip() if plot_el else None
                            
                            self.cursor.execute("""
                                UPDATE movies SET rating = ?, genres = ?, plot = ? WHERE id = ?
                            """, (rating, genre_text or None, plot_text, mid))
                            
                            print(f"    [+] ENRICHED: Rating: {rating} | Genres: {genre_text}")
                            scraped_count += 1
                            success = True
                            time.sleep(0.5)
                            break
                except:
                    continue
            
            if not success:
                print(f"    [-] SIGNAL_LOST")

        self.conn.commit()
        print(f"
SCRAPE_COMPLETE: {scraped_count} entities enriched with YTS data.")

    def organize(self):
        print("
--- RESTRUCTURING FILE SYSTEM TO MATCH DATABASE ---")
        movies = self.cursor.execute("SELECT id, title, year, quality, thumbnail FROM movies").fetchall()
        
        renamed_count = 0
        
        for movie in movies:
            mid = movie['id']
            title = movie['title']
            year = movie['year']
            quality = movie['quality']
            
            # Find all files for this movie
            files = self.cursor.execute("SELECT id, path FROM files WHERE movie_id = ?", (mid,)).fetchall()
            if not files:
                continue
                
            # Assume all files are in the same directory (standard for this project)
            current_file_path = Path(files[0]['path'])
            current_dir = current_file_path.parent
            parent_dir = current_dir.parent
            
            # Skip if current_dir is the root of a library (should not happen with standard scan)
            self.cursor.execute("SELECT root_path FROM libraries")
            lib_roots = [Path(r[0]) for r in self.cursor.fetchall()]
            if any(current_dir == root for root in lib_roots):
                continue

            # Construct desired folder name: Title (Year) [Quality]
            new_name = f"{title}"
            if year:
                new_name += f" ({year})"
            if quality and quality != "Unknown":
                new_name += f" [{quality}]"
            
            # Sanitize new_name for filesystem
            new_name = re.sub(r'[<>:"/\|?*]', '_', new_name).strip()
            
            if current_dir.name == new_name:
                continue
                
            new_dir = parent_dir / new_name
            
            # Handle collision
            if new_dir.exists() and new_dir.resolve() != current_dir.resolve():
                print(f"  [!] COLLISION: {new_dir} already exists. Skipping {title}.")
                continue
                
            print(f"  [>] RENAMING: {current_dir.name} -> {new_name}")
            
            try:
                os.rename(current_dir, new_dir)
                renamed_count += 1
                
                # Update files paths in DB
                all_files = self.cursor.execute("SELECT id, path FROM files WHERE movie_id = ?", (mid,)).fetchall()
                for f in all_files:
                    old_path = Path(f['path'])
                    # We use relative path from old_dir to ensure we correctly map subfolders if any
                    try:
                        rel_path = old_path.relative_to(current_dir)
                        new_path = new_dir / rel_path
                        self.cursor.execute("UPDATE files SET path = ? WHERE id = ?", (str(new_path.absolute()), f['id']))
                    except ValueError:
                        # File is not under current_dir, skip it
                        pass
                
                # Update subtitles paths in DB
                subs = self.cursor.execute("SELECT id, path FROM subtitles WHERE movie_id = ?", (mid,)).fetchall()
                for s in subs:
                    old_sub_path = Path(s['path'])
                    try:
                        rel_sub_path = old_sub_path.relative_to(current_dir)
                        new_sub_path = new_dir / rel_sub_path
                        self.cursor.execute("UPDATE subtitles SET path = ? WHERE id = ?", (str(new_sub_path.absolute()), s['id']))
                    except ValueError:
                        pass
                    
                # Update thumbnail path if it was in the old directory
                if movie['thumbnail']:
                    old_thumb_path = Path(movie['thumbnail'])
                    try:
                        rel_thumb_path = old_thumb_path.relative_to(current_dir)
                        new_thumb_path = new_dir / rel_thumb_path
                        self.cursor.execute("UPDATE movies SET thumbnail = ? WHERE id = ?", (str(new_thumb_path.absolute()), mid))
                    except ValueError:
                        pass
                        
            except Exception as e:
                print(f"  [!] ERROR renaming {current_dir}: {e}")
                
        self.conn.commit()
        print(f"ORGANIZE_COMPLETE: {renamed_count} folders reorganized.")

    def close(self):
        self.conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='MirrorMessiah Unified CLI')
    parser.add_argument('command', choices=['scan', 'cleanup', 'sync', 'scrape', 'full', 'reset', 'organize'], help='Command to execute')
    parser.add_argument('--root', help='Root media path for scan')
    parser.add_argument('--db', default='media.db', help='Database path')
    parser.add_argument('--lax', action='store_true', help='Disable strict 1080p MP4 requirement')
    parser.add_argument('--force', action='store_true', help='Force scrape even if data exists')
    
    args = parser.parse_args()
    
    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = Path(__file__).parent.parent / db_path

    if args.command == 'reset':
        if db_path.exists(): 
            os.remove(db_path)
            print(f"DATABASE_PURGED: {db_path}")

    manager = MessiahManager(db_path)
    
    if args.command in ['scan', 'full']:
        if not args.root: print("Error: --root required"); sys.exit(1)
        manager.scan(args.root)
    
    if args.command in ['cleanup', 'full']:
        manager.cleanup()

    if args.command == 'organize':
        manager.organize()
        
    if args.command in ['sync', 'full']:
        manager.sync(strict=not args.lax)

    if args.command in ['scrape', 'full']:
        manager.scrape(force=args.force)
        
    manager.close()
