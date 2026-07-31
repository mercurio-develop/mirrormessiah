#!/usr/bin/env python3
"""
courses_cli — MirrorMessiah Courses CLI

Commands:
  sync      <dir>   Scan courses directory and ingest lessons
  organize          Normalize folder layout on disk
  cleanup           Purge orphans and merge duplicates
  convert   [dir]   Convert MKV/AVI to web MP4
  thumbs            Generate lesson thumbnails via ffmpeg
  audit             Report missing thumbnails
  full      [dir]   sync -> cleanup -> organize -> convert -> thumbs
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
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
    index_subtitle_tree,
    is_lesson_video,
    lesson_file_name,
    lesson_thumb_name,
    module_folder_name,
    parse_course_metadata,
    resolve_lesson_path,
)

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / '.env')

DB_PATH = os.getenv('DB_PATH') or str(ROOT / 'media.db')
COURSES_DIR = os.getenv('COURSES_DIR') or '/media/tushita/TUSHITA_LINUX_DATA/courses'


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
        root = resolve_course_root_from_file(Path(file_row['path']), Path(COURSES_DIR))
        if root:
            return root
    if course_row:
        safe = format_course_folder_name(course_row['title'], course_row['platform'])
        candidate = Path(COURSES_DIR) / safe
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


def ingest_course(db: sqlite3.Connection, course_folder: Path, lib_id: int) -> None:
    raw_name = course_folder.name
    meta = parse_course_metadata(raw_name)
    title = meta.title
    platform = meta.platform
    category = meta.category
    language = meta.language
    print(f'Processing Course: {title} [{platform or "Unknown"} · {category}]')

    row = db.execute('SELECT id FROM courses WHERE LOWER(title) = LOWER(?)', (title,)).fetchone()
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

        existing = db.execute(
            'SELECT id FROM lesson_files WHERE lesson_id = ? AND path = ?',
            (lesson_id, str(video)),
        ).fetchone()
        if not existing:
            db.execute(
                'INSERT OR IGNORE INTO lesson_files (library_id, lesson_id, path, size_bytes, container) VALUES (?, ?, ?, ?, ?)',
                (lib_id, lesson_id, str(video), video.stat().st_size, video.suffix.lstrip('.')),
            )
            lesson_count += 1
            print(f'  [+] L{parsed.module_number:02d}-{parsed.lesson_number:02d}: {video.name}')

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
        print(f'  [?] No new video lessons found')


def resync_course_subtitles(db: sqlite3.Connection, course_id: int) -> tuple[int, int]:
    course_path = resolve_course_path(db, course_id)
    if not course_path:
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


def cmd_cleanup(args) -> None:
    print('\n--- INITIATING COURSES REGISTRY CLEANUP ---')
    db = open_db()
    for f in db.execute('SELECT id, path FROM lesson_files').fetchall():
        if not Path(f['path']).exists():
            db.execute('DELETE FROM lesson_files WHERE id = ?', (f['id'],))
    for s in db.execute('SELECT id, path FROM lesson_subtitles').fetchall():
        if not Path(s['path']).exists():
            db.execute('DELETE FROM lesson_subtitles WHERE id = ?', (s['id'],))
    db.execute('DELETE FROM lessons WHERE id NOT IN (SELECT lesson_id FROM lesson_files)')
    db.execute('DELETE FROM course_modules WHERE id NOT IN (SELECT module_id FROM lessons)')
    db.execute('DELETE FROM courses WHERE id NOT IN (SELECT course_id FROM course_modules)')

    seen: dict[str, int] = {}
    merged = 0
    for course in db.execute('SELECT id, title, platform FROM courses').fetchall():
        if getattr(args, 'course_id', None) and course['id'] != args.course_id:
            continue
        key = course['title'].lower()
        pure = clean_course_name(course['title'])
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
    print(f'CLEANUP_COMPLETE: merged {merged} duplicate courses')


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
    lib_id = get_library_id(db)
    exts = {'.mkv'}
    if getattr(args, 'all_formats', False):
        exts.update({'.avi', '.webm', '.mov'})

    files = db.execute("""
        SELECT lf.id, lf.path, lf.lesson_id
        FROM lesson_files lf
        JOIN lessons l ON lf.lesson_id = l.id
        JOIN course_modules m ON l.module_id = m.id
    """).fetchall()

    converted = 0
    for i, f in enumerate(files, 1):
        path = Path(f['path'])
        if path.suffix.lower() not in exts or not path.exists():
            continue
        print(f'\n  [{i}] Converting: {path.name}')
        subprocess.run([sys.executable, str(script_path), str(path)], check=False)
        mp4 = path.with_suffix('.mp4')
        if mp4.exists():
            db.execute('UPDATE lesson_files SET path = ?, container = ? WHERE id = ?', (str(mp4), 'mp4', f['id']))
            converted += 1
    db.commit()
    db.close()
    print(f'CONVERT_COMPLETE: {converted} files converted')


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
        result = subprocess.run(
            ['ffmpeg', '-y', '-ss', seek, '-i', str(video_path), '-frames:v', '1', '-q:v', '2', str(dest)],
            capture_output=True, check=False,
        )
        return result.returncode == 0 and dest.exists()
    except OSError:
        return False


def cmd_thumbs(args) -> None:
    print('\n--- PHASE: Generating Lesson Thumbnails ---')
    db = open_db()
    force = getattr(args, 'force', False)
    generated = skipped = failed = 0

    for course in db.execute('SELECT id, title FROM courses').fetchall():
        if getattr(args, 'course_id', None) and course['id'] != args.course_id:
            continue
        course_path = resolve_course_path(db, course['id'])
        if not course_path:
            continue
        courses_root = Path(COURSES_DIR).resolve()
        rows = db.execute("""
            SELECT l.id, l.lesson_number, l.title, l.thumbnail, m.module_number, m.module_kind, lf.path
            FROM lessons l
            JOIN course_modules m ON l.module_id = m.id
            JOIN lesson_files lf ON lf.lesson_id = l.id
            WHERE m.course_id = ? AND lf.path LIKE ?
        """, (course['id'], str(courses_root) + '%')).fetchall()

        for row in rows:
            title = row['title'] or f'Lesson {row["lesson_number"]}'
            dest = lesson_thumb_path(course_path, row['module_number'], row['module_kind'], row['lesson_number'], title)
            if dest.exists() and not force:
                if row['thumbnail'] != str(dest):
                    db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(dest), row['id']))
                skipped += 1
                continue
            video = Path(row['path'])
            try:
                video.resolve().relative_to(courses_root)
            except ValueError:
                failed += 1
                continue
            if not video.exists():
                failed += 1
                continue
            if extract_thumbnail_ffmpeg(video, dest):
                db.execute('UPDATE lessons SET thumbnail = ? WHERE id = ?', (str(dest), row['id']))
                generated += 1
            else:
                failed += 1

        poster = course_path / 'poster.jpg'
        if not poster.exists():
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

    db.commit()
    db.close()
    print(f'THUMBS_COMPLETE: generated={generated}, skipped={skipped}, failed={failed}')


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
    cmd_sync(args)
    cmd_cleanup(args)
    cmd_organize(args)
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

    p_thumbs = sub.add_parser('thumbs', help='Generate lesson thumbnails')
    p_thumbs.add_argument('--force', action='store_true')
    p_thumbs.add_argument('--course-id', type=int, default=None, help='Limit to one course')

    sub.add_parser('audit', help='Report missing thumbnails')

    p_full = sub.add_parser('full', help='sync -> cleanup -> organize -> convert -> thumbs')
    p_full.add_argument('dir', nargs='?', default=COURSES_DIR)
    p_full.add_argument('--force', action='store_true')

    args = parser.parse_args()
    if not hasattr(args, 'force'):
        args.force = False

    commands = {
        'sync': cmd_sync,
        'organize': cmd_organize,
        'cleanup': cmd_cleanup,
        'convert': cmd_convert,
        'thumbs': cmd_thumbs,
        'audit': cmd_audit,
        'full': cmd_full,
    }
    commands[args.command](args)


if __name__ == '__main__':
    main()
