#!/bin/bash
# MirrorMessiah - Dev to Prod Sync Script
# This script safely migrates the local dev database to the Docker production volume.

set -e

# Change to the project root directory
cd "$(dirname "$0")/.."

CONTAINER_NAME="mirrormessiah-web"
DEV_DB="media.db"
SQL_DUMP="sync_to_prod.sql"
PROD_DB_PATH="/app/data/media.db"
PROD_SQL_PATH="/app/data/sync_to_prod.sql"

# Argument Parsing
MODE="DB_ONLY"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --build) MODE="FULL_BUILD"; shift ;;
        --restart) MODE="RESTART"; shift ;;
        --help) echo "Usage: $0 [--build | --restart]"; exit 0 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

echo "--- MIRRORMESSIAH DEPLOYMENT MODE: $MODE ---"

# 1. Verify local DB exists
if [ ! -f "$DEV_DB" ]; then
    echo "ERROR: Local database $DEV_DB not found."
    exit 1
fi

# 2. Handle Rebuild/Restart
if [ "$MODE" == "FULL_BUILD" ]; then
    echo "[0/5] Rebuilding system from source..."
    docker compose build --no-cache
    echo "[0/5] Starting services..."
    docker compose up -d
    sleep 2
elif [ "$MODE" == "RESTART" ]; then
    echo "[0/5] Restarting services..."
    docker compose restart web
    sleep 2
fi

# 3. Check if container is running
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "ERROR: Container $CONTAINER_NAME is not running. Run 'docker compose up -d' first."
    exit 1
fi

# 4. Create SQL Dump (Safe for transfer)
echo "[1/5] Dumping local database..."
sqlite3 "$DEV_DB" ".dump" > "$SQL_DUMP"

# 5. Copy to container
echo "[2/5] Uploading dump to production..."
docker cp "$SQL_DUMP" "$CONTAINER_NAME:$PROD_SQL_PATH"

# 6. Reconstruct inside container
echo "[3/5] Reconstructing production registry..."
docker exec "$CONTAINER_NAME" python3 -c "
import sqlite3, os, sys
db = '$PROD_DB_PATH'
sql = '$PROD_SQL_PATH'

# Clean binary files
for f in [db, db+'-shm', db+'-wal']:
    if os.path.exists(f): os.remove(f)

try:
    conn = sqlite3.connect(db)
    with open(sql, 'r') as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
    print('SUCCESS: Database synchronized.')
except Exception as e:
    print(f'FAILURE: {e}')
    sys.exit(1)
"

# 7. Sync schema
echo "[4/5] Synchronizing registry schema..."
docker exec "$CONTAINER_NAME" python3 scripts/mm.py status > /dev/null

# 8. Cleanup
echo "[5/5] Purging temporary transfer files..."
rm "$SQL_DUMP"
docker exec "$CONTAINER_NAME" rm -f "$PROD_SQL_PATH"

echo "--- Restarting production service to load new registry ---"
docker compose restart web

echo "--- DEPLOYMENT COMPLETE ---"
