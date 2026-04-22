#!/bin/bash
# MirrorMessiah - Dev to Prod Sync Script
# This script safely migrates the local dev database to the Docker production volume.

set -e

CONTAINER_NAME="mirrormessiah-web"
DEV_DB="media.db"
SQL_DUMP="sync_to_prod.sql"
PROD_DB_PATH="/app/data/media.db"
PROD_SQL_PATH="/app/data/sync_to_prod.sql"

# Check for --build flag
REBUILD=false
for arg in "$@"; do
  if [ "$arg" == "--build" ]; then
    REBUILD=true
  fi
done

echo "--- INITIATING REGISTRY EXPORT ---"

# 1. Verify local DB exists
if [ ! -f "$DEV_DB" ]; then
    echo "ERROR: Local database $DEV_DB not found."
    exit 1
fi

# 2. Optional: Rebuild and Restart System
if [ "$REBUILD" = true ]; then
    echo "[0/5] Rebuilding system from source..."
    docker compose build --no-cache
    echo "[0/5] Restarting services..."
    docker compose up -d
    # Wait a moment for DB volume to mount
    sleep 2
fi

# 3. Check if container is running
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "ERROR: Container $CONTAINER_NAME is not running. Please run 'docker compose up -d' first."
    exit 1
fi

# 4. Create SQL Dump (Safe for transfer)
echo "[1/5] Dumping local database..."
sqlite3 "$DEV_DB" ".dump" > "$SQL_DUMP"

# 5. Copy to container
echo "[2/5] Uploading dump to production volume..."
docker cp "$SQL_DUMP" "$CONTAINER_NAME:$PROD_SQL_PATH"

# 6. Reconstruct inside container
echo "[3/5] Reconstructing production registry..."
docker exec -it "$CONTAINER_NAME" python3 -c "
import sqlite3, os, sys
db = '$PROD_DB_PATH'
sql = '$PROD_SQL_PATH'

if not os.path.exists(sql):
    print(f'Error: Dump not found in container at {sql}')
    sys.exit(1)

# Remove existing binary files to prevent corruption/locks
for f in [db, db+'-shm', db+'-wal']:
    if os.path.exists(f): 
        try: os.remove(f)
        except: pass

try:
    conn = sqlite3.connect(db)
    with open(sql, 'r') as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
    print('SUCCESS: Production database updated.')
except Exception as e:
    print(f'FAILURE: Could not reconstruct DB: {e}')
    sys.exit(1)
"

# 7. Ensure schema is current (runs migrations)
echo "[4/5] Synchronizing registry schema..."
docker exec "$CONTAINER_NAME" python3 scripts/mm.py status > /dev/null

# 8. Cleanup
echo "[5/5] Cleaning up temporary files..."
rm "$SQL_DUMP"
docker exec "$CONTAINER_NAME" rm -f "$PROD_SQL_PATH"

echo "--- SYNC COMPLETE ---"
echo "You can verify the status with: docker exec -it $CONTAINER_NAME python3 scripts/mm.py status"
