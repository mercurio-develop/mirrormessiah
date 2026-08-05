#!/usr/bin/env python3
"""
courses_cli — MirrorMessiah Courses CLI

Commands:
  sync      <dir>   Scan courses directory and ingest lessons
  organize          Normalize folder layout on disk
  cleanup           Purge orphans and merge duplicates
  convert   [dir]   Convert MKV/AVI to web MP4
  relink            Fix lesson paths after library move (e.g. W11 -> Linux)
  thumbs            Generate lesson & module thumbnails via ffmpeg
  scrape            Fill course metadata (plot, instructor, year, category) via Gemini
  audit             Report missing thumbnails
  full      [dir]   sync -> cleanup -> organize -> relink -> convert -> thumbs
  reingest  <path>  Clear and re-ingest one course folder (fixes collapsed flat layouts)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

from course_parse import (
    SUB_EXT,
    VIDEO_EXT,
    clean_course_name,
    detect_category,
    detect_lang_from_path,
    detect_platform,
    extract_language_tags,
    find_sidecar_subtitle,
    format_course_folder_name,
    course_match_key,
    index_subtitle_tree,
    is_lesson_video,
    lesson_file_name,
    lesson_thumb_name,
    module_folder_name,
    parse_course_metadata,
    resolve_lesson_path,
    is_ultimate_go_flat_course,
)

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / '.env')

DB_PATH = os.getenv('DB_PATH') or str(ROOT / 'media.db')
COURSES_DIR = os.getenv('COURSES_DIR') or '/media/tushita/TUSHITA_LINUX_DATA/courses'
LEGACY_COURSES_DIRS = os.getenv('LEGACY_COURSES_DIRS', '')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
GEMINI_MODEL_FALLBACKS = ('gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-flash-latest')
SCRAPE_CATEGORIES = ('VFX & 3D', 'Development', 'General')


def _ensure_tables(db: sqlite3.Connection) -> None:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS courses (
          id           INTEGER PRIMARY KEY,
          library_id   INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          title        TEXT NOT NULL,
          year         INTEGER,
          plot         TEXT,
          rating       REAL,
          thumbnail    TEXT,
          platform     TEXT,
          instructor   TEXT,
          language     TEXT,
          needs_repair INTEGER DEFAULT 0,
          category     TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS course_modules (
          id            INTEGER PRIMARY KEY,
          course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          module_number INTEGER NOT NULL,
          module_kind   TEXT NOT NULL DEFAULT 'module',
          title         TEXT,
          plot          TEXT,
          poster        TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(course_id, module_number)
        );

        CREATE TABLE IF NOT EXISTS lessons (
          id             INTEGER PRIMARY KEY,
          module_id      INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
          lesson_number  INTEGER NOT NULL,
          title          TEXT,
          plot           TEXT,
          runtime        INTEGER,
          thumbnail      TEXT,
          needs_repair   INTEGER DEFAULT 0,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(module_id, lesson_number)
        );

        CREATE TABLE IF NOT EXISTS lesson_files (
          id           INTEGER PRIMARY KEY,
          library_id   INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          path         TEXT NOT NULL UNIQUE,
          size_bytes   INTEGER,
          container    TEXT,
          added_at     TEXT NOT NULL DEFAULT (datetime('now')),
          mime_type    TEXT,
          duration_sec INTEGER,
          width        INTEGER,
          height       INTEGER,
          video_codec  TEXT,
          audio_codec  TEXT,
          language     TEXT
        );

        CREATE TABLE IF NOT EXISTS lesson_subtitles (
          id           INTEGER PRIMARY KEY,
          lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          file_id      INTEGER REFERENCES lesson_files(id) ON DELETE CASCADE,
          path         TEXT NOT NULL UNIQUE,
          lang         TEXT,
          label        TEXT,
          format       TEXT,
          default_flag INTEGER DEFAULT 0,
          size_bytes   INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);
        CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_subtitles_lesson ON lesson_subtitles(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_files_lesson ON lesson_files(lesson_id);
    """)
    cols = {row[1] for row in db.execute('PRAGMA table_info(courses)').fetchall()}
    if 'category' not in cols:
        db.execute('ALTER TABLE courses ADD COLUMN category TEXT')
    db.commit()


def open_db() -> sqlite3.Connection:
    if not Path(DB_PATH).exists():
        print(f'ERROR: DB not found: {DB_PATH}')
        sys.exit(1)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    _ensure_tables(db)
    return db


def get_library_id(db: sqlite3.Connection, root_path: str | None = None) -> int:
    root = (root_path or COURSES_DIR).rstrip('/')
    row = db.execute(
        'SELECT id FROM libraries WHERE root_path = ?',
        (root,),
    ).fetchone()
    if row:
        return row['id']
    label = Path(root).name or 'courses'
    name = f'Courses ({label})'
    suffix = 2
    while db.execute('SELECT id FROM libraries WHERE name = ?', (name,)).fetchone():
        name = f'Courses ({label} #{suffix})'
        suffix += 1
    cur = db.execute(
        "INSERT INTO libraries (name, root_path) VALUES (?, ?)",
        (name, root),
    )
    db.commit()
    return cur.lastrowid


def resolve_course_root_from_file(file_path: Path, courses_dir: Path) -> Path | None:
    root = courses_dir.resolve()
    try:
        rel = file_path.resolve().relative_to(root)
        if rel.parts:
            return root / rel.parts[0]
    except ValueError:
        pass
    return None


def update_paths_for_root_rename(db: sqlite3.Connection, old_root: Path, new_root: Path) -> int:
    old = str(old_root.resolve()).rstrip('/')
    new = str(new_root.resolve()).rstrip('/')
    updated = 0
    for table, column in (
        ('lesson_files', 'path'),
        ('lesson_subtitles', 'path'),
        ('lessons', 'thumbnail'),
        ('course_modules', 'poster'),
        ('courses', 'thumbnail'),
    ):
        rows = db.execute(
            f'SELECT id, {column} AS value FROM {table} WHERE {column} LIKE ?',
            (old + '%',),
        ).fetchall()
        for row in rows:
            value = row['value']
            if not value or not str(value).startswith(old):
                continue
            db.execute(
                f'UPDATE {table} SET {column} = ? WHERE id = ?',
                (new + str(value)[len(old):], row['id']),
            )
            updated += 1
    return updated


def rename_course_root_folder(
    db: sqlite3.Connection,
    course_id: int,
    courses_dir: Path,
    dry_run: bool = False,
) -> bool:
    course = db.execute(
        'SELECT title, platform FROM courses WHERE id = ?',
        (course_id,),
    ).fetchone()
    if not course:
        return False

    target_name = format_course_folder_name(course['title'], course['platform'])
    target_root = courses_dir / target_name

    courses_prefix = str(courses_dir.resolve()) + '%'
    file_row = db.execute("""
        SELECT lf.path FROM lesson_files lf
        JOIN lessons l ON lf.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ? AND lf.path LIKE ?
        LIMIT 1
    """, (course_id, courses_prefix)).fetchone()
    if not file_row:
        file_row = db.execute("""
            SELECT lf.path FROM lesson_files lf
            JOIN lessons l ON lf.lesson_id = l.id
            JOIN course_modules m ON l.module_id = m.id
            WHERE m.course_id = ?
            LIMIT 1
        """, (course_id,)).fetchone()

    current_root: Path | None = None
    if file_row and file_row['path']:
        current_root = resolve_course_root_from_file(Path(file_row['path']), courses_dir)
    if current_root is None and target_root.exists():
        return False
    if current_root is None:
        print(f'  [skip] {course["title"]}: no files on disk')
        return False
    if current_root.resolve() == target_root.resolve():
        return False
    if target_root.exists():
        print(f'  [!] CONFLICT: target exists for {course["title"]}: {target_name}')
        return False

    if dry_run:
        print(f'  [folder] {current_root.name}')
        print(f'        -> {target_name}')
        return True

    try:
        shutil.move(str(current_root), str(target_root))
    except OSError as exc:
        print(f'  [!] ERROR renaming {current_root.name}: {exc}')
        return False

    changed = update_paths_for_root_rename(db, current_root, target_root)
    print(f'  [folder] {current_root.name} -> {target_name} ({changed} paths updated)')
    return True


def courses_root() -> Path:
    return Path(COURSES_DIR).resolve()


def courses_roots() -> list[Path]:
    """Primary and legacy course library roots (deduped, existing only)."""
    seen: set[str] = set()
    roots: list[Path] = []
    candidates = [COURSES_DIR]
    if LEGACY_COURSES_DIRS:
        candidates.extend(p.strip() for p in LEGACY_COURSES_DIRS.split(':'))
    else:
        candidates.append('/media/tushita/TUSHITA_W11_DATA/Courses')
    for raw in candidates:
        if not raw:
            continue
        resolved = str(Path(raw).resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        p = Path(resolved)
        if p.is_dir():
            roots.append(p)
    return roots or [courses_root()]


def courses_path_prefixes() -> list[str]:
    return [str(r).rstrip('/') + '%' for r in courses_roots()]


def path_under_courses(path: str | Path) -> bool:
    try:
        resolved = Path(path).resolve()
    except OSError:
        return False
    for root in courses_roots():
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def upsert_lesson_file(
    db: sqlite3.Connection,
    lib_id: int,
    lesson_id: int,
    video: Path,
) -> str:
    """Link a lesson to a video on disk. Returns 'added', 'updated', or 'unchanged'."""
    new_path = str(video.resolve())
    container = video.suffix.lstrip('.').lower()
    size = video.stat().st_size
    root = str(courses_root())

    rows = db.execute(
        'SELECT id, path FROM lesson_files WHERE lesson_id = ?',
        (lesson_id,),
    ).fetchall()

    for row in rows:
        if row['path'] == new_path:
            return 'unchanged'

    owner = db.execute(
        'SELECT id, lesson_id FROM lesson_files WHERE path = ?',
        (new_path,),
    ).fetchone()
    if owner:
        if owner['lesson_id'] == lesson_id:
            return 'unchanged'
        # File already linked to another lesson — drop stale rows for this one
        for row in rows:
            if row['id'] != owner['id']:
                db.execute('DELETE FROM lesson_files WHERE id = ?', (row['id'],))
        return 'unchanged'

    stale_ids = [
        row['id'] for row in rows
        if not Path(row['path']).exists() or not path_under_courses(row['path'])
    ]
    valid_ids = [row['id'] for row in rows if row['id'] not in stale_ids]

    if stale_ids and valid_ids:
        for sid in stale_ids:
            db.execute('DELETE FROM lesson_files WHERE id = ?', (sid,))
        return 'unchanged'

    if stale_ids:
        try:
            db.execute(
                'UPDATE lesson_files SET path = ?, size_bytes = ?, container = ? WHERE id = ?',
                (new_path, size, container, stale_ids[0]),
            )
        except sqlite3.IntegrityError:
            db.execute('DELETE FROM lesson_files WHERE id = ?', (stale_ids[0],))
            return 'unchanged'
        for sid in stale_ids[1:]:
            db.execute('DELETE FROM lesson_files WHERE id = ?', (sid,))
        return 'updated'

    if not rows:
        db.execute(
            'INSERT INTO lesson_files (library_id, lesson_id, path, size_bytes, container) VALUES (?, ?, ?, ?, ?)',
            (lib_id, lesson_id, new_path, size, container),
        )
        return 'added'

    cur = db.execute(
        'INSERT OR IGNORE INTO lesson_files (library_id, lesson_id, path, size_bytes, container) VALUES (?, ?, ?, ?, ?)',
        (lib_id, lesson_id, new_path, size, container),
    )
    return 'added' if cur.rowcount else 'unchanged'


def relink_file_to_mp4(db: sqlite3.Connection, file_id: int, source_path: Path) -> bool:
    """Point a lesson_files row at its MP4 sibling, or drop the row if MP4 is already linked."""
    mp4 = source_path.with_suffix('.mp4')
    if not mp4.exists():
        return False
    mp4_str = str(mp4.resolve())

    owner = db.execute(
        'SELECT id, lesson_id FROM lesson_files WHERE path = ?',
        (mp4_str,),
    ).fetchone()
    if owner:
        if owner['id'] == file_id:
            return True
        db.execute('DELETE FROM lesson_files WHERE id = ?', (file_id,))
        return True

    try:
        db.execute(
            'UPDATE lesson_files SET path = ?, container = ? WHERE id = ?',
            (mp4_str, 'mp4', file_id),
        )
    except sqlite3.IntegrityError:
        db.execute('DELETE FROM lesson_files WHERE id = ?', (file_id,))
    return True


def relink_converted_mkv(db: sqlite3.Connection) -> int:
    """Point lesson_files at MP4 when MKV was converted but DB still references MKV."""
    updated = 0
    for row in db.execute("SELECT id, path FROM lesson_files WHERE lower(path) LIKE '%.mkv'").fetchall():
        mkv = Path(row['path'])
        mp4 = mkv.with_suffix('.mp4')
        if mp4.exists() and path_under_courses(mp4):
            if relink_file_to_mp4(db, row['id'], mkv):
                updated += 1
    return updated


def relink_course_from_disk(db: sqlite3.Connection, course_folder: Path, lib_id: int) -> tuple[int, int]:
    """Re-scan a course folder and fix stale lesson_files paths. Returns (updated, added)."""
    raw_name = course_folder.name
    meta = parse_course_metadata(raw_name)
    row = find_course_by_key(db, meta.title)
    if not row:
        return 0, 0
    course_id = row['id']
    sub_index = index_subtitle_tree(course_folder)
    updated = added = 0

    for video in sorted(course_folder.rglob('*')):
        if not is_lesson_video(video):
            continue
        if any(p.startswith('.') for p in video.relative_to(course_folder).parts):
            continue

        parsed = resolve_lesson_path(course_folder, video)
        if not parsed:
            continue

        mod_row = db.execute(
            'SELECT id FROM course_modules WHERE course_id = ? AND module_number = ?',
            (course_id, parsed.module_number),
        ).fetchone()
        if mod_row:
            module_id = mod_row['id']
        else:
            cur = db.execute(
                'INSERT INTO course_modules (course_id, module_number, module_kind, title) VALUES (?, ?, ?, ?)',
                (course_id, parsed.module_number, parsed.module_kind, parsed.module_title),
            )
            module_id = cur.lastrowid

        lesson_row = db.execute(
            'SELECT id FROM lessons WHERE module_id = ? AND lesson_number = ?',
            (module_id, parsed.lesson_number),
        ).fetchone()
        if lesson_row:
            lesson_id = lesson_row['id']
        else:
            cur = db.execute(
                'INSERT INTO lessons (module_id, lesson_number, title) VALUES (?, ?, ?)',
                (module_id, parsed.lesson_number, parsed.lesson_title),
            )
            lesson_id = cur.lastrowid

        result = upsert_lesson_file(db, lib_id, lesson_id, video)
        if result == 'updated':
            updated += 1
        elif result == 'added':
            added += 1

        sidecar = find_sidecar_subtitle(video)
        if sidecar:
            lang = detect_lang_from_path(sidecar)
            db.execute(
                'INSERT OR IGNORE INTO lesson_subtitles (lesson_id, path, lang, format, size_bytes) VALUES (?, ?, ?, ?, ?)',
                (lesson_id, str(sidecar), lang, sidecar.suffix.lstrip('.'), sidecar.stat().st_size),
            )
        else:
            for sub_path in sub_index.get((parsed.module_number, parsed.lesson_number), []):
                lang = detect_lang_from_path(sub_path)
                db.execute(
                    'INSERT OR IGNORE INTO lesson_subtitles (lesson_id, path, lang, format, size_bytes) VALUES (?, ?, ?, ?, ?)',
                    (lesson_id, str(sub_path), lang, sub_path.suffix.lstrip('.'), sub_path.stat().st_size),
                )

    discover_local_artwork(db, course_id, course_folder)
    return updated, added


def resolve_course_path(db: sqlite3.Connection, course_id: int, course_row: sqlite3.Row | None = None) -> Path | None:
    if course_row is None:
        course_row = db.execute('SELECT * FROM courses WHERE id = ?', (course_id,)).fetchone()
    file_row = db.execute("""
        SELECT lf.path FROM lesson_files lf
        JOIN lessons l ON lf.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ? LIMIT 1
    """, (course_id,)).fetchone()
    if file_row and file_row['path']:
        for root in courses_roots():
            resolved = resolve_course_root_from_file(Path(file_row['path']), root)
            if resolved:
                return resolved
    if course_row:
        for root in courses_roots():
            safe = format_course_folder_name(course_row['title'], course_row['platform'])
            candidate = root / safe
            if candidate.exists():
                return candidate
    return None


def lesson_thumb_path(course_path: Path, module_num: int, module_kind: str, lesson_num: int, title: str) -> Path:
    mod_dir = course_path / module_folder_name(module_kind, module_num)
    return mod_dir / lesson_thumb_name(lesson_num, title)


def discover_local_artwork(db: sqlite3.Connection, course_id: int, course_path: Path | None) -> None:
    if not course_path or not course_path.exists():
        return
    poster = course_path / 'poster.jpg'
    if poster.exists():
        db.execute('UPDATE courses SET thumbnail = ? WHERE id = ?', (str(poster), course_id))
    for mod in db.execute(
        'SELECT id, module_number, module_kind, poster FROM course_modules WHERE course_id = ?',
        (course_id,),
    ).fetchall():
        if mod['poster']:
            continue
        mod_poster = course_path / module_folder_name(mod['module_kind'], mod['module_number']) / 'poster.jpg'
        if mod_poster.exists():
            db.execute('UPDATE course_modules SET poster = ? WHERE id = ?', (str(mod_poster), mod['id']))
    for row in db.execute("""
        SELECT l.id, l.lesson_number, l.title, l.thumbnail, m.module_number, m.module_kind
        FROM lessons l
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ?
    """, (course_id,)).fetchall():
        if row['thumbnail'] and Path(row['thumbnail']).exists():
            continue
        thumb = lesson_thumb_path(
            course_path, row['module_number'], row['module_kind'],
            row['lesson_number'], row['title'] or f'Lesson {row["lesson_number"]}',
        )
        if thumb.exists():
            db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(thumb), row['id']))


def clear_course_lesson_data(db: sqlite3.Connection, course_id: int) -> None:
    """Remove modules, lessons, and files for a course (keeps the course row)."""
    db.execute(
        'DELETE FROM lesson_subtitles WHERE lesson_id IN ('
        'SELECT l.id FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = ?)',
        (course_id,),
    )
    db.execute(
        'DELETE FROM lesson_files WHERE lesson_id IN ('
        'SELECT l.id FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = ?)',
        (course_id,),
    )
    db.execute(
        'DELETE FROM lessons WHERE module_id IN (SELECT id FROM course_modules WHERE course_id = ?)',
        (course_id,),
    )
    db.execute('DELETE FROM course_modules WHERE course_id = ?', (course_id,))


def course_needs_flat_rebuild(db: sqlite3.Connection, course_id: int, course_folder: Path) -> bool:
    """Detect collapsed flat courses (e.g. lesson1..91 all merged into one lesson)."""
    if not is_ultimate_go_flat_course(course_folder):
        return False
    video_count = sum(1 for p in course_folder.iterdir() if p.is_file() and is_lesson_video(p))
    if video_count < 10:
        return False
    mod_count = db.execute(
        'SELECT COUNT(*) AS n FROM course_modules WHERE course_id = ?', (course_id,),
    ).fetchone()['n']
    lesson_count = db.execute(
        'SELECT COUNT(*) AS n FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = ?',
        (course_id,),
    ).fetchone()['n']
    if mod_count >= 10 and lesson_count >= video_count * 0.9:
        return False
    max_files = db.execute(
        'SELECT MAX(fc) AS n FROM ('
        '  SELECT COUNT(lf.id) AS fc FROM lessons l'
        '  JOIN course_modules m ON l.module_id = m.id'
        '  LEFT JOIN lesson_files lf ON lf.lesson_id = l.id'
        '  WHERE m.course_id = ? GROUP BY l.id'
        ')',
        (course_id,),
    ).fetchone()['n'] or 0
    return lesson_count <= 1 or max_files > 1 or lesson_count < video_count * 0.5


def ingest_course(db: sqlite3.Connection, course_folder: Path, lib_id: int) -> None:
    raw_name = course_folder.name
    meta = parse_course_metadata(raw_name)
    title = meta.title
    platform = meta.platform
    category = meta.category
    language = meta.language
    print(f'Processing Course: {title} [{platform or "Unknown"} · {category}]')

    row = find_course_by_key(db, meta.title)
    if row:
        course_id = row['id']
        db.execute(
            'UPDATE courses SET platform = COALESCE(?, platform), language = COALESCE(?, language), category = COALESCE(?, category) WHERE id = ?',
            (platform, language, category, course_id),
        )
    else:
        cur = db.execute(
            'INSERT INTO courses (library_id, title, platform, language, category) VALUES (?, ?, ?, ?, ?)',
            (lib_id, title, platform, language, category),
        )
        course_id = cur.lastrowid

    if row and course_needs_flat_rebuild(db, course_id, course_folder):
        print('  [!] Collapsed flat layout detected — rebuilding modules and lessons')
        clear_course_lesson_data(db, course_id)

    sub_index = index_subtitle_tree(course_folder)
    lesson_count = 0

    for video in sorted(course_folder.rglob('*')):
        if not is_lesson_video(video):
            continue
        if any(p.startswith('.') for p in video.relative_to(course_folder).parts):
            continue

        parsed = resolve_lesson_path(course_folder, video)
        if not parsed:
            continue

        mod_row = db.execute(
            'SELECT id FROM course_modules WHERE course_id = ? AND module_number = ?',
            (course_id, parsed.module_number),
        ).fetchone()
        if mod_row:
            module_id = mod_row['id']
            db.execute(
                'UPDATE course_modules SET module_kind = ?, title = COALESCE(?, title) WHERE id = ?',
                (parsed.module_kind, parsed.module_title, module_id),
            )
        else:
            cur = db.execute(
                'INSERT INTO course_modules (course_id, module_number, module_kind, title) VALUES (?, ?, ?, ?)',
                (course_id, parsed.module_number, parsed.module_kind, parsed.module_title),
            )
            module_id = cur.lastrowid

        lesson_row = db.execute(
            'SELECT id FROM lessons WHERE module_id = ? AND lesson_number = ?',
            (module_id, parsed.lesson_number),
        ).fetchone()
        if lesson_row:
            lesson_id = lesson_row['id']
            db.execute(
                'UPDATE lessons SET title = COALESCE(?, title) WHERE id = ?',
                (parsed.lesson_title, lesson_id),
            )
        else:
            cur = db.execute(
                'INSERT INTO lessons (module_id, lesson_number, title) VALUES (?, ?, ?)',
                (module_id, parsed.lesson_number, parsed.lesson_title),
            )
            lesson_id = cur.lastrowid

        result = upsert_lesson_file(db, lib_id, lesson_id, video)
        if result in ('added', 'updated'):
            lesson_count += 1
            tag = 'relinked' if result == 'updated' else 'added'
            print(f'  [+] L{parsed.module_number:02d}-{parsed.lesson_number:02d} ({tag}): {video.name}')

        sidecar = find_sidecar_subtitle(video)
        if sidecar:
            lang = detect_lang_from_path(sidecar)
            db.execute(
                'INSERT OR IGNORE INTO lesson_subtitles (lesson_id, path, lang, format, size_bytes) VALUES (?, ?, ?, ?, ?)',
                (lesson_id, str(sidecar), lang, sidecar.suffix.lstrip('.'), sidecar.stat().st_size),
            )
        else:
            for sub_path in sub_index.get((parsed.module_number, parsed.lesson_number), []):
                lang = detect_lang_from_path(sub_path)
                db.execute(
                    'INSERT OR IGNORE INTO lesson_subtitles (lesson_id, path, lang, format, size_bytes) VALUES (?, ?, ?, ?, ?)',
                    (lesson_id, str(sub_path), lang, sub_path.suffix.lstrip('.'), sub_path.stat().st_size),
                )

    discover_local_artwork(db, course_id, course_folder)
    db.commit()
    if lesson_count == 0:
        print(f'  [?] No new or relinked video lessons found')


def cmd_relink(args) -> None:
    media_dir = Path(getattr(args, 'dir', None) or COURSES_DIR)
    print(f'\n--- PHASE: Relinking Course Paths ---')
    db = open_db()
    lib_id = get_library_id(db, str(media_dir))
    roots = courses_roots()
    print(f'  Scanning roots: {", ".join(str(r) for r in roots)}')

    mkv_relinked = relink_converted_mkv(db)
    if mkv_relinked:
        print(f'  [+] Relinked {mkv_relinked} converted MKV -> MP4 entries')

    total_updated = total_added = 0
    scanned: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        root_lib = get_library_id(db, str(root))
        for item in sorted(root.iterdir()):
            if not item.is_dir() or item.name.startswith('.'):
                continue
            key = str(item.resolve())
            if key in scanned:
                continue
            scanned.add(key)
            updated, added = relink_course_from_disk(db, item, root_lib)
            if updated or added:
                print(f'  {item.name}: {updated} relinked, {added} added')
            total_updated += updated
            total_added += added

    # Purge duplicate/stale lesson_files when a valid sibling exists under courses root
    purged = 0
    for row in db.execute('SELECT id, path, lesson_id FROM lesson_files').fetchall():
        p = Path(row['path'])
        under = path_under_courses(p)
        exists = p.exists()
        if under and exists:
            continue
        siblings = db.execute(
            'SELECT path FROM lesson_files WHERE lesson_id = ? AND id != ?',
            (row['lesson_id'], row['id']),
        ).fetchall()
        has_valid = any(path_under_courses(s['path']) and Path(s['path']).exists() for s in siblings)
        if has_valid or (not under and not exists):
            db.execute('DELETE FROM lesson_files WHERE id = ?', (row['id'],))
            purged += 1

    db.commit()
    db.close()
    print(f'RELINK_COMPLETE: {total_updated} paths updated, {total_added} files added, {purged} stale rows purged')


def resync_course_subtitles(db: sqlite3.Connection, course_id: int) -> tuple[int, int]:
    course_path = resolve_course_path(db, course_id)
    if not course_path or not course_path.exists():
        return 0, 0
    sub_index = index_subtitle_tree(course_path)
    added = removed = 0
    lessons = db.execute("""
        SELECT l.id, l.lesson_number, m.module_number
        FROM lessons l
        JOIN course_modules m ON l.module_id = m.id
        WHERE m.course_id = ?
    """, (course_id,)).fetchall()
    for lesson in lessons:
        db.execute('DELETE FROM lesson_subtitles WHERE lesson_id = ?', (lesson['id'],))
        file_row = db.execute(
            'SELECT path FROM lesson_files WHERE lesson_id = ? LIMIT 1', (lesson['id'],),
        ).fetchone()
        matched: list[Path] = []
        if file_row:
            sidecar = find_sidecar_subtitle(Path(file_row['path']))
            if sidecar:
                matched.append(sidecar)
        matched.extend(sub_index.get((lesson['module_number'], lesson['lesson_number']), []))
        seen = set()
        for sub_path in matched:
            key = str(sub_path)
            if key in seen:
                continue
            seen.add(key)
            if not sub_path.exists():
                continue
            lang = detect_lang_from_path(sub_path)
            db.execute(
                'INSERT OR IGNORE INTO lesson_subtitles (lesson_id, path, lang, format, size_bytes) VALUES (?, ?, ?, ?, ?)',
                (lesson['id'], key, lang, sub_path.suffix.lstrip('.'), sub_path.stat().st_size),
            )
            added += 1
    return added, removed


def cmd_reingest(args) -> None:
    target = Path(args.path)
    if not target.is_dir():
        print(f'ERROR: Course folder not found: {target}')
        return
    media_dir = target.parent
    print(f'\n--- PHASE: Re-ingesting Course [{target.name}] ---')
    db = open_db()
    lib_id = get_library_id(db, str(media_dir))
    row = find_course_by_key(db, parse_course_metadata(target.name).title)
    if row:
        print(f'  Clearing existing lesson data for course id {row["id"]}')
        clear_course_lesson_data(db, row['id'])
    ingest_course(db, target, lib_id)
    db.commit()
    db.close()
    print('REINGEST_COMPLETE')


def cmd_sync(args) -> None:
    media_dir = Path(args.dir)
    print(f'\n--- PHASE: Syncing Courses [{media_dir}] ---')
    db = open_db()
    lib_id = get_library_id(db, str(media_dir))
    if not media_dir.exists():
        print(f'ERROR: Courses directory not found: {media_dir}')
        return
    for item in sorted(media_dir.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            ingest_course(db, item, lib_id)
    print('\n--- PHASE: Resyncing Lesson Subtitles ---')
    sub_added = 0
    for course in db.execute('SELECT id FROM courses').fetchall():
        a, _ = resync_course_subtitles(db, course['id'])
        sub_added += a
    db.commit()
    total = db.execute('SELECT COUNT(*) AS n FROM courses').fetchone()['n']
    lessons = db.execute('SELECT COUNT(*) AS n FROM lessons').fetchone()['n']
    db.close()
    print('SYNC_COMPLETE')
    print(f'  Courses: {total}, Lessons: {lessons}, Subtitles linked: {sub_added}')


def find_course_by_key(db: sqlite3.Connection, title: str) -> sqlite3.Row | None:
    key = course_match_key(title)
    for row in db.execute('SELECT id, title FROM courses').fetchall():
        if course_match_key(row['title']) == key:
            return row
    return None


def dedupe_lesson_files(db: sqlite3.Connection) -> int:
    """Remove duplicate lesson_files within a course (same video basename)."""
    removed = 0
    for course in db.execute('SELECT id, title FROM courses').fetchall():
        rows = db.execute("""
            SELECT lf.id, lf.path, lf.lesson_id
            FROM lesson_files lf
            JOIN lessons l ON lf.lesson_id = l.id
            JOIN course_modules m ON l.module_id = m.id
            WHERE m.course_id = ?
        """, (course['id'],)).fetchall()
        by_name: dict[str, list[sqlite3.Row]] = {}
        for row in rows:
            by_name.setdefault(Path(row['path']).name.lower(), []).append(row)

        for basename, group in by_name.items():
            if len(group) < 2:
                continue
            def rank(r: sqlite3.Row) -> tuple:
                p = Path(r['path'])
                return (
                    1 if p.exists() else 0,
                    1 if path_under_courses(p) else 0,
                    -len(str(p)),
                    str(p),
                )
            group.sort(key=rank, reverse=True)
            keep = group[0]
            for dup in group[1:]:
                db.execute('DELETE FROM lesson_files WHERE id = ?', (dup['id'],))
                removed += 1
                other = db.execute(
                    'SELECT id FROM lesson_files WHERE lesson_id = ?',
                    (dup['lesson_id'],),
                ).fetchone()
                if not other and dup['lesson_id'] != keep['lesson_id']:
                    db.execute('UPDATE OR IGNORE lesson_files SET lesson_id = ? WHERE id = ?', (keep['lesson_id'], keep['id']))
    return removed


def report_case_variant_folders() -> list[tuple[str, list[str]]]:
    from collections import defaultdict
    variants: list[tuple[str, list[str]]] = []
    for root in courses_roots():
        by_key: dict[str, list[str]] = defaultdict(list)
        for item in root.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                by_key[course_match_key(item.name)].append(item.name)
        for key, names in by_key.items():
            if len(names) > 1:
                variants.append((key, sorted(names)))
    return variants


def cmd_cleanup(args) -> None:
    print('\n--- INITIATING COURSES REGISTRY CLEANUP ---')
    db = open_db()
    for f in db.execute('SELECT id, path FROM lesson_files').fetchall():
        if not Path(f['path']).exists():
            db.execute('DELETE FROM lesson_files WHERE id = ?', (f['id'],))
    for s in db.execute('SELECT id, path FROM lesson_subtitles').fetchall():
        if not Path(s['path']).exists():
            db.execute('DELETE FROM lesson_subtitles WHERE id = ?', (s['id'],))
    for l in db.execute('SELECT id, thumbnail FROM lessons WHERE thumbnail IS NOT NULL').fetchall():
        thumb = l['thumbnail']
        if thumb and not thumb.startswith('http') and not Path(thumb).exists():
            db.execute('UPDATE lessons SET thumbnail = NULL WHERE id = ?', (l['id'],))
    for c in db.execute('SELECT id, thumbnail FROM courses WHERE thumbnail IS NOT NULL').fetchall():
        thumb = c['thumbnail']
        if thumb and not thumb.startswith('http') and not Path(thumb).exists():
            db.execute('UPDATE courses SET thumbnail = NULL WHERE id = ?', (c['id'],))
    db.execute('DELETE FROM lessons WHERE id NOT IN (SELECT lesson_id FROM lesson_files)')
    db.execute('DELETE FROM course_modules WHERE id NOT IN (SELECT module_id FROM lessons)')
    db.execute('DELETE FROM courses WHERE id NOT IN (SELECT course_id FROM course_modules)')

    deduped = dedupe_lesson_files(db)
    if deduped:
        print(f'  [+] Removed {deduped} duplicate lesson file rows (same basename)')
    db.execute('DELETE FROM lessons WHERE id NOT IN (SELECT lesson_id FROM lesson_files)')
    db.execute('DELETE FROM course_modules WHERE id NOT IN (SELECT module_id FROM lessons)')
    db.execute('DELETE FROM courses WHERE id NOT IN (SELECT course_id FROM course_modules)')

    variants = report_case_variant_folders()
    if variants:
        print('\n--- CASE-VARIANT FOLDERS ON DISK (same course, different spelling) ---')
        for _key, names in variants:
            print(f'  {"  |  ".join(names)}')

    seen: dict[str, int] = {}
    merged = 0
    for course in db.execute('SELECT id, title, platform FROM courses').fetchall():
        if getattr(args, 'course_id', None) and course['id'] != args.course_id:
            continue
        pure = clean_course_name(course['title'])
        key = course_match_key(pure)
        platform = course['platform'] or detect_platform(course['title'])
        category = detect_category(course['title'], platform, pure)
        if pure != course['title'] or platform or category:
            db.execute(
                'UPDATE courses SET title = ?, platform = COALESCE(?, platform), category = ? WHERE id = ?',
                (pure, platform, category, course['id']),
            )
        if key in seen:
            primary = seen[key]
            for mod in db.execute('SELECT * FROM course_modules WHERE course_id = ?', (course['id'],)).fetchall():
                existing = db.execute(
                    'SELECT id FROM course_modules WHERE course_id = ? AND module_number = ?',
                    (primary, mod['module_number']),
                ).fetchone()
                if existing:
                    for les in db.execute('SELECT id, lesson_number FROM lessons WHERE module_id = ?', (mod['id'],)).fetchall():
                        dup = db.execute(
                            'SELECT id FROM lessons WHERE module_id = ? AND lesson_number = ?',
                            (existing['id'], les['lesson_number']),
                        ).fetchone()
                        if dup:
                            db.execute('UPDATE OR IGNORE lesson_files SET lesson_id = ? WHERE lesson_id = ?', (dup['id'], les['id']))
                            db.execute('UPDATE OR IGNORE lesson_subtitles SET lesson_id = ? WHERE lesson_id = ?', (dup['id'], les['id']))
                            db.execute('DELETE FROM lessons WHERE id = ?', (les['id'],))
                        else:
                            db.execute('UPDATE lessons SET module_id = ? WHERE id = ?', (existing['id'], les['id']))
                    db.execute('DELETE FROM course_modules WHERE id = ?', (mod['id'],))
                else:
                    db.execute('UPDATE course_modules SET course_id = ? WHERE id = ?', (primary, mod['id']))
            db.execute('DELETE FROM courses WHERE id = ?', (course['id'],))
            merged += 1
        else:
            seen[key] = course['id']
    db.commit()
    db.close()
    print(f'CLEANUP_COMPLETE: merged {merged} duplicate courses, deduped {deduped} file rows')


def cmd_organize(args) -> None:
    dry_run = getattr(args, 'dry_run', False)
    lessons = getattr(args, 'lessons', False)
    course_filter = getattr(args, 'course_id', None)
    courses_dir = Path(COURSES_DIR)

    print('\n--- INITIATING FILESYSTEM REORGANIZATION (COURSES) ---')
    if dry_run:
        print('DRY RUN — no files will be moved')
    print('Layout: {Platform} - {Title}/[{Week|Chapter|Section} NN]/LNN - Lesson.ext')
    if not lessons:
        print('Mode: course folders only (pass --lessons to normalize lesson files too)')

    db = open_db()
    courses_dir_str = str(courses_dir.resolve())
    if course_filter:
        courses = db.execute(
            'SELECT id, title, platform FROM courses WHERE id = ?',
            (course_filter,),
        ).fetchall()
    else:
        courses = db.execute('''
            SELECT DISTINCT c.id, c.title, c.platform
            FROM courses c
            JOIN course_modules m ON m.course_id = c.id
            JOIN lessons l ON l.module_id = m.id
            JOIN lesson_files lf ON lf.lesson_id = l.id
            WHERE lf.path LIKE ?
            ORDER BY c.title ASC
        ''', (courses_dir_str + '%',)).fetchall()
    folder_renamed = 0
    for course in courses:
        if rename_course_root_folder(db, course['id'], courses_dir, dry_run=dry_run):
            folder_renamed += 1

    if not lessons:
        if not dry_run:
            db.commit()
        db.close()
        print(f'ORGANIZE_COMPLETE: {folder_renamed} course folders renamed')
        return

    print('\n--- Normalizing lesson files ---')
    renamed = skipped = cross_device = 0
    courses_dir_resolved = courses_dir.resolve()
    for course in courses:
        course_id = course['id']
        standard_name = format_course_folder_name(course['title'], course['platform'])
        standard_path = courses_dir / standard_name

        rows = db.execute("""
            SELECT l.id AS lesson_id, l.lesson_number, l.title AS lesson_title,
                   l.thumbnail, m.module_number, m.module_kind, m.title AS module_title,
                   lf.id AS file_id, lf.path
            FROM lessons l
            JOIN course_modules m ON l.module_id = m.id
            JOIN lesson_files lf ON lf.lesson_id = l.id
            WHERE m.course_id = ? AND lf.path LIKE ?
        """, (course_id, str(courses_dir_resolved) + '%')).fetchall()

        for row in rows:
            old_path = Path(row['path'])
            try:
                old_path.resolve().relative_to(courses_dir_resolved)
            except ValueError:
                cross_device += 1
                continue
            if not old_path.exists():
                new_guess = standard_path / module_folder_name(row['module_kind'], row['module_number']) / lesson_file_name(
                    row['lesson_number'], row['lesson_title'] or f'Lesson {row["lesson_number"]}', old_path.suffix,
                )
                if new_guess.exists():
                    conflict = db.execute(
                        'SELECT id FROM lesson_files WHERE path = ? AND id != ?',
                        (str(new_guess), row['file_id']),
                    ).fetchone()
                    if conflict:
                        db.execute('DELETE FROM lesson_files WHERE id = ?', (row['file_id'],))
                        continue
                    db.execute('UPDATE lesson_files SET path = ? WHERE id = ?', (str(new_guess), row['file_id']))
                    old_path = new_guess
                else:
                    continue

            mod_dir = standard_path / module_folder_name(row['module_kind'], row['module_number'], row['module_title'])
            lesson_title = row['lesson_title'] or f'Lesson {row["lesson_number"]}'
            new_path = mod_dir / lesson_file_name(row['lesson_number'], lesson_title, old_path.suffix)

            if old_path == new_path:
                continue
            if new_path.exists():
                print(f'  [!] CONFLICT: {new_path.name}')
                skipped += 1
                continue
            try:
                mod_dir.mkdir(parents=True, exist_ok=True)
                os.rename(old_path, new_path)
                file_conflict = db.execute(
                    'SELECT id FROM lesson_files WHERE path = ? AND id != ?',
                    (str(new_path), row['file_id']),
                ).fetchone()
                if file_conflict:
                    db.execute('DELETE FROM lesson_files WHERE id = ?', (row['file_id'],))
                    skipped += 1
                    continue
                db.execute('UPDATE lesson_files SET path = ? WHERE id = ?', (str(new_path), row['file_id']))
                renamed += 1
                print(f'  [rename] {old_path.name} -> {mod_dir.name}/{new_path.name}')

                if row['thumbnail']:
                    old_thumb = Path(row['thumbnail'])
                    new_thumb = mod_dir / lesson_thumb_name(row['lesson_number'], lesson_title)
                    if old_thumb.exists() and old_thumb != new_thumb:
                        if not new_thumb.exists():
                            os.rename(old_thumb, new_thumb)
                        db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(new_thumb), row['lesson_id']))

                subs = db.execute('SELECT id, path FROM lesson_subtitles WHERE lesson_id = ?', (row['lesson_id'],)).fetchall()
                for sub in subs:
                    old_sub = Path(sub['path'])
                    if not old_sub.exists():
                        continue
                    lang = detect_lang_from_path(old_sub)
                    ext = old_sub.suffix
                    base = lesson_file_name(row['lesson_number'], lesson_title, '')
                    new_sub = mod_dir / f'{base}.{lang}{ext}'
                    if old_sub == new_sub:
                        continue
                    if new_sub.exists():
                        existing = db.execute(
                            'SELECT id FROM lesson_subtitles WHERE path = ?',
                            (str(new_sub),),
                        ).fetchone()
                        if existing and existing['id'] != sub['id']:
                            db.execute('DELETE FROM lesson_subtitles WHERE id = ?', (sub['id'],))
                        elif not existing:
                            db.execute('UPDATE lesson_subtitles SET path = ? WHERE id = ?', (str(new_sub), sub['id']))
                        continue
                    conflict = db.execute(
                        'SELECT id FROM lesson_subtitles WHERE path = ? AND id != ?',
                        (str(new_sub), sub['id']),
                    ).fetchone()
                    if conflict:
                        db.execute('DELETE FROM lesson_subtitles WHERE id = ?', (sub['id'],))
                        continue
                    try:
                        shutil.copy2(old_sub, new_sub)
                    except OSError:
                        os.rename(old_sub, new_sub)
                    db.execute('UPDATE lesson_subtitles SET path = ? WHERE id = ?', (str(new_sub), sub['id']))
            except OSError as exc:
                print(f'  [!] ERROR: {old_path.name}: {exc}')

        discover_local_artwork(db, course_id, standard_path if standard_path.exists() else resolve_course_path(db, course_id))

    if not dry_run:
        db.commit()
    db.close()
    print(f'ORGANIZE_COMPLETE: {folder_renamed} folders, {renamed} lesson files renamed, {skipped} skipped, {cross_device} outside courses root')


def cmd_convert(args) -> None:
    print('\n--- PHASE: Converting Course Videos ---')
    db = open_db()
    script_path = Path(__file__).parent / 'convert_to_web.py'
    exts = {'.mkv'}
    if getattr(args, 'all_formats', False):
        exts.update({'.avi', '.webm', '.mov'})

    mkv_relinked = relink_converted_mkv(db)
    if mkv_relinked:
        print(f'  [+] Relinked {mkv_relinked} already-converted MKV -> MP4 entries')
        db.commit()

    prefixes = courses_path_prefixes()
    path_clause = ' OR '.join('lf.path LIKE ?' for _ in prefixes)
    print(f'  Scanning: {", ".join(p.rstrip("%") for p in prefixes)}')

    files = db.execute(f"""
        SELECT lf.id, lf.path, lf.lesson_id
        FROM lesson_files lf
        JOIN lessons l ON lf.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
        WHERE {path_clause}
    """, prefixes).fetchall()

    to_convert: list[tuple[int | None, Path]] = []
    seen_paths: set[str] = set()

    for f in files:
        path = Path(f['path'])
        if path.suffix.lower() not in exts or not path.exists():
            continue
        if not path_under_courses(path):
            continue
        key = str(path.resolve())
        if key in seen_paths:
            continue
        seen_paths.add(key)
        to_convert.append((f['id'], path))

    for root in courses_roots():
        for path in sorted(root.rglob('*')):
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            if path.name.endswith('.bak') or path.name.startswith('.mm_tmp_'):
                continue
            key = str(path.resolve())
            if key in seen_paths:
                continue
            seen_paths.add(key)
            to_convert.append((None, path))

    converted = 0
    for i, (file_id, path) in enumerate(to_convert, 1):
        print(f'\n  [{i}/{len(to_convert)}] Converting: {path.name}')
        subprocess.run([sys.executable, str(script_path), str(path)], check=False)
        mp4 = path.with_suffix('.mp4')
        if mp4.exists():
            if file_id is not None:
                relink_file_to_mp4(db, file_id, path)
            else:
                # Try to match lesson by scanning parent course folder
                for root in courses_roots():
                    course_root = resolve_course_root_from_file(path, root)
                    if course_root:
                        root_lib = get_library_id(db, str(root))
                        relink_course_from_disk(db, course_root, root_lib)
                        break
            converted += 1
            db.commit()
    db.close()
    print(f'CONVERT_COMPLETE: {converted}/{len(to_convert)} files converted')


def extract_thumbnail_ffmpeg(video_path: Path, dest: Path) -> bool:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(video_path)],
            capture_output=True, text=True, check=False,
        )
        seek = '00:00:05'
        if probe.stdout.strip():
            try:
                duration = float(probe.stdout.strip())
                seek = str(max(1.0, duration * 0.1))
            except ValueError:
                pass
        # Letterbox to 16:9 so UI thumbnails show the full frame without cropping.
        vf = 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black'
        result = subprocess.run(
            ['ffmpeg', '-y', '-ss', seek, '-i', str(video_path), '-frames:v', '1', '-vf', vf, '-q:v', '2', str(dest)],
            capture_output=True, check=False,
        )
        return result.returncode == 0 and dest.exists()
    except OSError:
        return False


def lesson_thumb_dest(course_path: Path, video: Path, module_num: int, module_kind: str, lesson_num: int, title: str) -> Path:
    """Pick thumbnail path — canonical module folder, or next to flat-layout videos."""
    canonical = lesson_thumb_path(course_path, module_num, module_kind, lesson_num, title)
    try:
        video.relative_to(course_path)
    except ValueError:
        return canonical
    rel_parts = video.relative_to(course_path).parts
    if len(rel_parts) == 1:
        # Flat layout (e.g. Pikuma): keep thumbs in Module folder for consistency
        return canonical
    if video.parent == canonical.parent:
        return canonical
    # Video lives in a non-canonical folder — place thumb beside the video
    return video.parent / lesson_thumb_name(lesson_num, title)


def generate_module_posters(db: sqlite3.Connection, course_id: int, course_path: Path, force: bool = False) -> int:
    generated = 0
    modules = db.execute(
        'SELECT id, module_number, module_kind, title, poster FROM course_modules WHERE course_id = ? ORDER BY module_number',
        (course_id,),
    ).fetchall()
    for mod in modules:
        mod_dir = course_path / module_folder_name(mod['module_kind'], mod['module_number'], mod['title'])
        poster = mod_dir / 'poster.jpg'
        db_poster = mod['poster']
        if not force and db_poster and Path(db_poster).exists() and poster.exists():
            continue
        if not force and poster.exists():
            db.execute('UPDATE course_modules SET poster = ? WHERE id = ?', (str(poster), mod['id']))
            continue
        first = db.execute("""
            SELECT l.thumbnail FROM lessons l
            WHERE l.module_id = ? AND l.thumbnail IS NOT NULL
            ORDER BY l.lesson_number LIMIT 1
        """, (mod['id'],)).fetchone()
        if not first or not first['thumbnail']:
            continue
        src = Path(first['thumbnail'])
        if not src.exists():
            continue
        try:
            mod_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, poster)
            db.execute('UPDATE course_modules SET poster = ? WHERE id = ?', (str(poster), mod['id']))
            generated += 1
        except OSError:
            pass
    return generated


def cmd_thumbs(args) -> None:
    print('\n--- PHASE: Generating Lesson Thumbnails ---')
    db = open_db()
    force = getattr(args, 'force', False)
    missing_only = getattr(args, 'missing_only', False) and not force
    generated = skipped = failed = 0
    module_posters = 0
    failed_no_file = failed_outside_root = failed_ffmpeg = 0

    for course in db.execute('SELECT id, title FROM courses').fetchall():
        if getattr(args, 'course_id', None) and course['id'] != args.course_id:
            continue
        course_path = resolve_course_path(db, course['id'])
        if not course_path:
            continue
        root = courses_root()
        prefixes = courses_path_prefixes()
        path_clause = ' OR '.join('lf.path LIKE ?' for _ in prefixes)
        rows = db.execute(f"""
            SELECT l.id, l.lesson_number, l.title, l.thumbnail, m.module_number, m.module_kind, lf.path
            FROM lessons l
            JOIN course_modules m ON l.module_id = m.id
            JOIN lesson_files lf ON lf.lesson_id = l.id
            WHERE m.course_id = ? AND ({path_clause})
        """, (course['id'], *prefixes)).fetchall()

        course_gen = course_skip = course_fail = 0
        for row in rows:
            title = row['title'] or f'Lesson {row["lesson_number"]}'
            video = Path(row['path'])
            dest = lesson_thumb_dest(
                course_path, video,
                row['module_number'], row['module_kind'],
                row['lesson_number'], title,
            )
            db_thumb = row['thumbnail']
            has_thumb = dest.exists() or (
                db_thumb and (db_thumb.startswith('http') or Path(db_thumb).exists())
            )
            if missing_only and has_thumb:
                if db_thumb != str(dest) and dest.exists():
                    db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(dest), row['id']))
                skipped += 1
                course_skip += 1
                continue
            if dest.exists() and not force:
                if db_thumb != str(dest):
                    db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(dest), row['id']))
                skipped += 1
                course_skip += 1
                continue
            if not path_under_courses(video):
                failed += 1
                failed_outside_root += 1
                course_fail += 1
                continue
            if not video.exists():
                failed += 1
                failed_no_file += 1
                course_fail += 1
                continue
            if extract_thumbnail_ffmpeg(video, dest):
                db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(dest), row['id']))
                generated += 1
                course_gen += 1
            else:
                failed += 1
                failed_ffmpeg += 1
                course_fail += 1

        poster = course_path / 'poster.jpg'
        if not poster.exists() or force:
            first = db.execute("""
                SELECT l.thumbnail FROM lessons l
                JOIN course_modules m ON l.module_id = m.id
                WHERE m.course_id = ? AND l.thumbnail IS NOT NULL
                ORDER BY m.module_number, l.lesson_number LIMIT 1
            """, (course['id'],)).fetchone()
            if first and first['thumbnail'] and Path(first['thumbnail']).exists():
                try:
                    shutil.copy2(first['thumbnail'], poster)
                    db.execute('UPDATE courses SET thumbnail = ? WHERE id = ?', (str(poster), course['id']))
                except OSError:
                    pass
        elif not db.execute('SELECT thumbnail FROM courses WHERE id = ?', (course['id'],)).fetchone()['thumbnail']:
            db.execute('UPDATE courses SET thumbnail = ? WHERE id = ?', (str(poster), course['id']))

        mod_posters = 0
        if getattr(args, 'module_posters', False):
            mod_posters = generate_module_posters(db, course['id'], course_path, force=force)
            module_posters += mod_posters

        db.commit()
        if course_gen or course_skip or course_fail or mod_posters:
            print(f'  [{course["id"]}] {course["title"]}: +{course_gen} thumbs, {mod_posters} module posters, {course_skip} skipped, {course_fail} failed')

    db.close()
    print(f'THUMBS_COMPLETE: generated={generated}, module_posters={module_posters}, skipped={skipped}, failed={failed}')
    if failed:
        print(f'  failures: no_file={failed_no_file}, outside_root={failed_outside_root}, ffmpeg={failed_ffmpeg}')


def _course_needs_scrape(row: sqlite3.Row, force: bool = False) -> bool:
    if force:
        return True
    return not (row['plot'] and row['instructor'] and row['year'] and row['category'])


def _lesson_hints_for_course(db: sqlite3.Connection, course_id: int, limit: int = 8) -> list[str]:
    rows = db.execute("""
        SELECT l.title, lf.path
        FROM lessons l
        JOIN course_modules m ON l.module_id = m.id
        LEFT JOIN lesson_files lf ON lf.lesson_id = l.id
        WHERE m.course_id = ?
        ORDER BY m.module_number, l.lesson_number
        LIMIT ?
    """, (course_id, limit)).fetchall()
    hints: list[str] = []
    for row in rows:
        if row['title']:
            hints.append(row['title'])
        elif row['path']:
            hints.append(Path(row['path']).stem)
    return hints


def _build_scrape_prompt(course: sqlite3.Row, lesson_hints: list[str]) -> str:
    platform = course['platform'] or 'Unknown'
    title = course['title'] or 'Unknown'
    hint_block = '\n'.join(f'- {h}' for h in lesson_hints[:8]) if lesson_hints else '(none)'
    categories = ', '.join(SCRAPE_CATEGORIES)
    return f"""You are cataloging an online video course for a personal media library.

Course platform: {platform}
Course title: {title}
Sample lesson titles:
{hint_block}

Return ONLY valid JSON with these keys:
- plot: 2-4 sentence course description (string)
- instructor: primary instructor name (string, or null if unknown)
- year: release or publication year as integer, or null if unknown
- category: exactly one of: {categories}

Do not invent specific URLs. Base answers on well-known public information when possible; otherwise infer conservatively from the title and lesson names."""


def _parse_gemini_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _gemini_models_to_try() -> list[str]:
    seen: set[str] = set()
    models: list[str] = []
    for model in (GEMINI_MODEL, *GEMINI_MODEL_FALLBACKS):
        if model and model not in seen:
            seen.add(model)
            models.append(model)
    return models


def _call_gemini_once(model: str, prompt: str) -> tuple[dict | None, int | None, str | None]:
    url = (
        f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
        f'?key={GEMINI_API_KEY}'
    )
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.2,
            'responseMimeType': 'application/json',
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode('utf-8', errors='replace')
        try:
            msg = json.loads(err_body).get('error', {}).get('message', err_body)
        except json.JSONDecodeError:
            msg = err_body
        return None, None, f'{model}: HTTP {exc.code} — {msg}'
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return None, None, f'{model}: {exc}'

    usage = body.get('usageMetadata') or {}
    total_tokens = usage.get('totalTokenCount')
    candidates = body.get('candidates') or []
    if not candidates:
        return None, total_tokens, f'{model}: empty response'
    parts = (candidates[0].get('content') or {}).get('parts') or []
    text = ''.join(part.get('text', '') for part in parts if isinstance(part, dict))
    parsed = _parse_gemini_json(text)
    if not parsed:
        return None, total_tokens, f'{model}: could not parse JSON response'
    return parsed, total_tokens, None


def _call_gemini(prompt: str) -> tuple[dict | None, int | None]:
    if not GEMINI_API_KEY:
        return None, None
    last_err: str | None = None
    for model in _gemini_models_to_try():
        parsed, tokens, err = _call_gemini_once(model, prompt)
        if parsed is not None:
            if model != GEMINI_MODEL:
                print(f'  [i] Used fallback model: {model}')
            return parsed, tokens
        last_err = err
    if last_err:
        print(f'  [!] Gemini request failed: {last_err}')
    return None, None


def _normalize_scraped_metadata(data: dict, course: sqlite3.Row) -> dict:
    plot = data.get('plot')
    instructor = data.get('instructor')
    year = data.get('year')
    category = data.get('category')

    if isinstance(plot, str):
        plot = plot.strip() or None
    else:
        plot = None

    if isinstance(instructor, str):
        instructor = instructor.strip() or None
    else:
        instructor = None

    if isinstance(year, str) and year.isdigit():
        year = int(year)
    if not isinstance(year, int) or year < 1900 or year > 2100:
        year = None

    if category not in SCRAPE_CATEGORIES:
        category = detect_category(course['title'] or '', course['platform'], course['title'])

    return {'plot': plot, 'instructor': instructor, 'year': year, 'category': category}


def scrape_one_course(db: sqlite3.Connection, course: sqlite3.Row, *, force: bool = False, dry_run: bool = False) -> str:
    if not _course_needs_scrape(course, force=force):
        return 'skip'
    hints = _lesson_hints_for_course(db, course['id'])
    prompt = _build_scrape_prompt(course, hints)
    parsed, tokens = _call_gemini(prompt)
    if not parsed:
        return 'fail'
    meta = _normalize_scraped_metadata(parsed, course)
    updates: dict[str, object] = {}
    for field in ('plot', 'instructor', 'year', 'category'):
        current = course[field]
        value = meta[field]
        if value is None:
            continue
        if force or current in (None, ''):
            updates[field] = value
    if not updates:
        return 'skip'
    if dry_run:
        print(f'  [dry-run] [{course["id"]}] {course["title"]}: {updates} (tokens={tokens})')
        return 'ok'
    set_clause = ', '.join(f'{k} = ?' for k in updates)
    db.execute(
        f"UPDATE courses SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        (*updates.values(), course['id']),
    )
    print(f'  [{course["id"]}] {course["title"]}: updated {list(updates.keys())} (tokens={tokens})')
    return 'ok'


def cmd_scrape(args) -> None:
    print('\n--- PHASE: Scraping Course Metadata (Gemini) ---')
    if not GEMINI_API_KEY:
        print('ERROR: GEMINI_API_KEY is not set')
        sys.exit(1)
    db = open_db()
    force = getattr(args, 'force', False)
    dry_run = getattr(args, 'dry_run', False)
    course_id = getattr(args, 'course_id', None)
    folder = getattr(args, 'folder', None)

    query = 'SELECT * FROM courses'
    params: list[object] = []
    if course_id:
        query += ' WHERE id = ?'
        params.append(course_id)
    elif folder:
        query += ' WHERE title LIKE ? OR title = ?'
        params.extend([f'%{folder}%', folder])
    query += ' ORDER BY title'

    courses = db.execute(query, params).fetchall()
    if not courses:
        print('No matching courses found.')
        db.close()
        return

    ok = skipped = failed = 0
    for idx, course in enumerate(courses):
        status = scrape_one_course(db, course, force=force, dry_run=dry_run)
        if status == 'ok':
            ok += 1
        elif status == 'skip':
            skipped += 1
        else:
            failed += 1
        if not dry_run and status == 'ok':
            db.commit()
        if idx + 1 < len(courses):
            time.sleep(1.0)

    if not dry_run:
        db.commit()
    db.close()
    print(f'SCRAPE_COMPLETE: updated={ok}, skipped={skipped}, failed={failed}')


def cmd_resync_subs(args) -> None:
    print('\n--- PHASE: Resyncing Lesson Subtitles ---')
    db = open_db()
    added = 0
    courses = db.execute('SELECT id, title FROM courses ORDER BY title').fetchall()
    for course in courses:
        if getattr(args, 'course_id', None) and course['id'] != args.course_id:
            continue
        a, _ = resync_course_subtitles(db, course['id'])
        added += a
        if a:
            print(f'  [{course["id"]}] {course["title"]}: {a} subtitles linked')
    db.commit()
    db.close()
    print(f'RESYNC_SUBS_COMPLETE: {added} subtitles linked')


def cmd_audit(args) -> None:
    db = open_db()
    discover_all = []
    for course in db.execute('SELECT id FROM courses').fetchall():
        discover_local_artwork(db, course['id'], resolve_course_path(db, course['id']))
    db.commit()

    missing = []
    total = 0
    for course in db.execute('SELECT id, title FROM courses ORDER BY title').fetchall():
        course_path = resolve_course_path(db, course['id'])
        rows = db.execute("""
            SELECT l.lesson_number, l.thumbnail, m.module_number
            FROM lessons l JOIN course_modules m ON l.module_id = m.id
            WHERE m.course_id = ?
            ORDER BY m.module_number, l.lesson_number
        """, (course['id'],)).fetchall()
        for row in rows:
            total += 1
            thumb = row['thumbnail']
            ok = thumb and (thumb.startswith('http') or Path(thumb).exists())
            if not ok and course_path:
                guess = lesson_thumb_path(course_path, row['module_number'], 'module', row['lesson_number'], f'L{row["lesson_number"]}')
                ok = guess.exists()
            if not ok:
                missing.append((course['title'], row['module_number'], row['lesson_number']))

    db.close()
    have = total - len(missing)
    print(f'\n--- COURSES THUMBNAIL AUDIT ---')
    print(f'  {have}/{total} lessons have thumbnails ({len(missing)} missing)')
    if missing:
        by_course: dict[str, list] = {}
        for title, mod, les in missing:
            by_course.setdefault(title, []).append(f'M{mod:02d}L{les:02d}')
        for title, items in sorted(by_course.items())[:15]:
            preview = ', '.join(items[:8])
            suffix = f' +{len(items)-8} more' if len(items) > 8 else ''
            print(f'      {title}: {preview}{suffix}')
        sys.exit(1)


def cmd_full(args) -> None:
    print('\n==========================================')
    print('   MirrorMessiah Courses: FULL PIPELINE')
    print('==========================================\n')
    if not hasattr(args, 'all_formats'):
        args.all_formats = not getattr(args, 'mkv_only', False)
    cmd_cleanup(args)
    cmd_sync(args)
    cmd_organize(args)
    cmd_relink(args)
    cmd_convert(args)
    cmd_thumbs(args)
    print('\n==========================================')
    print('   INTEGRATION COMPLETE')
    print('==========================================\n')


def main() -> None:
    parser = argparse.ArgumentParser(prog='courses_cli', description='MirrorMessiah Courses CLI')
    sub = parser.add_subparsers(dest='command', required=True)

    p_sync = sub.add_parser('sync', help='Ingest courses from directory')
    p_sync.add_argument('dir', nargs='?', default=COURSES_DIR)

    p_organize = sub.add_parser('organize', help='Rename course folders to {Platform} - {Title} layout')
    p_organize.add_argument('--dry-run', action='store_true', help='Preview folder renames without moving files')
    p_organize.add_argument('--course-id', type=int, default=None, help='Limit to one course')
    p_organize.add_argument(
        '--lessons',
        action='store_true',
        help='Also normalize lesson paths into Week/Chapter/Section + L## files (advanced)',
    )
    sub.add_parser('cleanup', help='Purge orphans and merge duplicates')

    p_convert = sub.add_parser('convert', help='Convert MKV to web MP4')
    p_convert.add_argument('dir', nargs='?', default=COURSES_DIR)
    p_convert.add_argument('--all-formats', action='store_true')

    p_relink = sub.add_parser('relink', help='Fix stale lesson paths after library move')
    p_relink.add_argument('dir', nargs='?', default=COURSES_DIR)

    p_thumbs = sub.add_parser('thumbs', help='Generate lesson & module thumbnails')
    p_thumbs.add_argument('--force', action='store_true')
    p_thumbs.add_argument('--missing-only', action='store_true', help='Skip lessons that already have a thumb on disk or in DB')
    p_thumbs.add_argument('--course-id', type=int, default=None, help='Limit to one course')
    p_thumbs.add_argument('--module-posters', action='store_true', help='Also copy first lesson thumb to each module poster.jpg')

    p_scrape = sub.add_parser('scrape', help='Scrape course metadata via Gemini')
    p_scrape.add_argument('--course-id', type=int, default=None, help='Limit to one course')
    p_scrape.add_argument('--folder', type=str, default=None, help='Match course by folder/title substring')
    p_scrape.add_argument('--force', action='store_true', help='Overwrite existing metadata fields')
    p_scrape.add_argument('--dry-run', action='store_true', help='Print proposed updates without writing')

    sub.add_parser('audit', help='Report missing thumbnails')

    p_resync = sub.add_parser('resync-subs', help='Re-link lesson subtitles from disk')
    p_resync.add_argument('--course-id', type=int, default=None, help='Limit to one course')

    p_full = sub.add_parser('full', help='cleanup -> sync -> organize -> relink -> convert -> thumbs')
    p_full.add_argument('dir', nargs='?', default=COURSES_DIR)
    p_full.add_argument('--force', action='store_true')
    p_full.add_argument('--mkv-only', action='store_true', help='Convert MKV only (skip AVI/WEBM/MOV)')

    p_reingest = sub.add_parser('reingest', help='Clear and re-ingest one course folder')
    p_reingest.add_argument('path', help='Path to course folder (e.g. .../Ardanlabs - Ultimate GO)')

    args = parser.parse_args()
    if not hasattr(args, 'force'):
        args.force = False
    if not hasattr(args, 'missing_only'):
        args.missing_only = False
    if not hasattr(args, 'module_posters'):
        args.module_posters = False
    if not hasattr(args, 'dry_run'):
        args.dry_run = False

    commands = {
        'sync': cmd_sync,
        'organize': cmd_organize,
        'cleanup': cmd_cleanup,
        'convert': cmd_convert,
        'relink': cmd_relink,
        'thumbs': cmd_thumbs,
        'scrape': cmd_scrape,
        'audit': cmd_audit,
        'resync-subs': cmd_resync_subs,
        'full': cmd_full,
        'reingest': cmd_reingest,
    }
    commands[args.command](args)


if __name__ == '__main__':
    main()
