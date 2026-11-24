#!/bin/bash
# MirrorMessiah - Deploy to NAS
# Builds the web image on this computer, ships it to the NAS over SSH and restarts it there.
# The NAS does not need git or the source code, only the docker-compose.yml + .env in NAS_APP_DIR.
#
# Required in .env (or the environment):
#   NAS_APP_DIR  Folder on the NAS that holds the mirrormessiah docker-compose.yml
# Optional:
#   NAS_SERVER   SSH target (default: root@shambala.local)
#   NAS_PORT     Port the app is published on, only used for the final URL (default: 6600)

set -euo pipefail

cd "$(dirname "$0")/.."

env_value() {
    [ -f .env ] || return 0
    grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

NAS_SERVER="${NAS_SERVER:-$(env_value NAS_SERVER)}"
NAS_SERVER="${NAS_SERVER:-root@shambala.local}"
NAS_APP_DIR="${NAS_APP_DIR:-$(env_value NAS_APP_DIR)}"
NAS_PORT="${NAS_PORT:-$(env_value NAS_PORT)}"
NAS_PORT="${NAS_PORT:-6600}"

IMAGE="mirrormessiah-web"
CONTAINER="mirrormessiah-web"

if [ -z "$NAS_APP_DIR" ]; then
    echo "ERROR: NAS_APP_DIR is not set. Add it to .env, e.g. NAS_APP_DIR=/srv/<disk>/apps/mirrormessiah" >&2
    exit 1
fi

[ -f /tmp/nas_ssh_agent.env ] && source /tmp/nas_ssh_agent.env 2>/dev/null || true

# One shared connection, so the SSH key passphrase is asked only once.
SSH_OPTS=(-o ControlMaster=auto -o ControlPath=/tmp/mm-deploy-%C -o ControlPersist=300)
remote() { ssh "${SSH_OPTS[@]}" "$NAS_SERVER" "$@"; }

echo "--- MIRRORMESSIAH NAS DEPLOY: $NAS_SERVER:$NAS_APP_DIR ---"

echo "[1/5] Building image on this computer..."
docker compose build web

echo "[2/5] Transferring image to the NAS..."
TMP_TAR="/tmp/${IMAGE}.tar.gz"
trap 'rm -f "$TMP_TAR"' EXIT
docker save "$IMAGE:latest" | gzip -1 > "$TMP_TAR"
rsync -P -e "ssh ${SSH_OPTS[*]}" "$TMP_TAR" "$NAS_SERVER:/tmp/${IMAGE}.tar.gz"

echo "[3/5] Loading image on the NAS..."
remote "gunzip -c /tmp/${IMAGE}.tar.gz | docker load && rm -f /tmp/${IMAGE}.tar.gz"

echo "[4/5] Restarting service on the NAS..."
remote "cd '$NAS_APP_DIR' && docker compose up -d && docker image prune -f >/dev/null"

echo "[5/5] Waiting for health check..."
for _ in $(seq 1 30); do
    status=$(remote "docker inspect -f '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null || echo unknown)
    if [ "$status" = healthy ]; then
        echo "--- DEPLOYMENT COMPLETE: http://${NAS_SERVER#*@}:$NAS_PORT ---"
        exit 0
    fi
    sleep 5
done

echo "Not healthy after 150s. Check logs: ssh $NAS_SERVER docker logs --tail 50 $CONTAINER" >&2
exit 1
