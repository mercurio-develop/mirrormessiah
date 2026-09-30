#!/usr/bin/env python3
"""Report thumbnail paths that are missing on disk or outside library roots."""

from __future__ import annotations

import os
import sqlite3
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv('DB_PATH', str(Path(__file__).resolve().parent.parent / 'data' / 'media.db'))


def env_roots() -> list[Path]:
    roots: list[Path] = []
    for key in ('MEDIA_DIR', 'SERIES_DIR', 'COURSES_DIR', 'MEDIA_ROOT'):
        value = os.getenv(key, '').strip()
        if value:
            roots.append(Path(value).resolve())
    legacy = os.getenv('LEGACY_COURSES_DIRS', '').strip()
    if legacy:
        for part in legacy.split(':'):
            part = part.strip()
            if part:
                roots.append(Path(part).resolve())
    return roots


def db_roots(conn: sqlite3.Connection) -> list[Path]:
    rows = conn.execute('SELECT root_path FROM libraries').fetchall()
    return [Path(row[0]).resolve() for row in rows if row[0]]


def allowed_roots(conn: sqlite3.Connection) -> list[Path]:
    seen: set[str] = set()
    roots: list[Path] = []
    for root in db_roots(conn) + env_roots():
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        roots.append(root)
    return roots


def under_root(target: Path, root: Path) -> bool:
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def audit_table(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    roots: list[Path],
    limit: int = 8,
) -> None:
    rows = conn.execute(
        f"SELECT id, {column} AS path FROM {table} "
        f"WHERE {column} IS NOT NULL AND {column} != '' AND {column} NOT LIKE 'http%'"
    ).fetchall()

    missing = 0
    denied = 0
    buckets: Counter[str] = Counter()
    samples: list[tuple[str, str, str]] = []

    for row_id, raw in rows:
        p = Path(raw)
        label = 'other'
        text = str(p)
        if 'TUSHITA_LINUX_DATA' in text:
            label = 'LINUX_DATA'
        elif 'TUSHITA_W11_DATA' in text:
            label = 'W11_DATA'
        buckets[label] += 1

        if not p.exists():
            missing += 1
            if len(samples) < limit:
                samples.append(('missing', table, text))
            continue

        if not any(under_root(p, root) for root in roots):
            denied += 1
            if len(samples) < limit:
                samples.append(('denied', table, text))

    print(f'\n{table}.{column}: {len(rows)} local paths')
    print(f'  missing on disk: {missing}')
    print(f'  outside library roots: {denied}')
    if buckets:
        print(f'  by drive: {dict(buckets)}')
    for kind, tbl, sample in samples:
        print(f'  sample [{kind}] {tbl}: {sample[:120]}')


def main() -> None:
    db_file = Path(DB_PATH)
    if not db_file.exists():
        print(f'ERROR: DB not found: {db_file}')
        raise SystemExit(1)

    conn = sqlite3.connect(db_file)
    roots = allowed_roots(conn)

    print(f'DB: {db_file}')
    print('Allowed roots:')
    for root in roots:
        print(f'  - {root} (exists={root.exists()})')

    for env_key in ('MEDIA_DIR', 'SERIES_DIR', 'COURSES_DIR', 'MEDIA_ROOT', 'LEGACY_COURSES_DIRS'):
        value = os.getenv(env_key, '')
        if value:
            print(f'{env_key}={value}')

    for table, column in (
        ('movies', 'thumbnail'),
        ('series', 'thumbnail'),
        ('courses', 'thumbnail'),
        ('lessons', 'thumbnail'),
        ('episodes', 'thumbnail'),
        ('course_modules', 'poster'),
    ):
        audit_table(conn, table, column, roots)

    conn.close()


if __name__ == '__main__':
    main()
