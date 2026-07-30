#!/usr/bin/env bash
# Daily OpenSubtitles pass: download missing Spanish (or MM_FETCH_SUBS_LANG) subs until quota runs out.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG="${MM_FETCH_SUBS_LOG:-$ROOT/logs/fetch-subs.log}"
mkdir -p "$(dirname "$LOG")"

LANG="${MM_FETCH_SUBS_LANG:-es}"

{
  echo "=== $(date -Is) fetch-subs lang=$LANG ==="
  python3 "$ROOT/scripts/mm.py" fetch-subs --no-backup --lang "$LANG"
  echo "=== done ==="
} >>"$LOG" 2>&1
