#!/bin/bash
# Run ON Shambala (NAS) as root.
# Mounts series + courses from Omarchy (10.0.0.175) and points MirrorMessiah at them.
#
# Omarchy must already be exporting (scripts/setup-nfs-library-shares.sh).
# Expected .env in NAS_APP_DIR (or pass NAS_APP_DIR=...):
#   SERIES_DIR, COURSES_DIR, LEGACY_COURSES_DIRS
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: run as root on the NAS" >&2
  exit 1
fi

OMARCHY_IP="${OMARCHY_IP:-10.0.0.175}"
NAS_APP_DIR="${NAS_APP_DIR:-/srv/dev-disk-by-uuid-159006cf-c05a-4e8c-8690-483fdd40614c/apps/mirrormessiah}"

SERIES_MNT=/mnt/omarchy-series
COURSES_MNT=/mnt/omarchy-courses
LEGACY_COURSES_MNT=/mnt/omarchy-courses-legacy

mkdir -p "$SERIES_MNT" "$COURSES_MNT" "$LEGACY_COURSES_MNT"

# Soft/hard NFS mounts; background retry so NAS boot is not blocked if Omarchy is off
ensure_fstab() {
  local remote="$1" localp="$2" marker="$3"
  if grep -qF "$marker" /etc/fstab; then
    return 0
  fi
  {
    echo "$marker"
    echo "$remote $localp nfs ro,nolock,_netdev,x-systemd.automount,x-systemd.mount-timeout=30,retry=5,timeo=150,retrans=5 0 0"
  } >> /etc/fstab
}

ensure_fstab "$OMARCHY_IP:/run/media/tushita/DATA/series" "$SERIES_MNT" "# omarchy-series"
ensure_fstab "$OMARCHY_IP:/run/media/tushita/DATA1/courses" "$COURSES_MNT" "# omarchy-courses"
ensure_fstab "$OMARCHY_IP:/run/media/tushita/DATA/courses" "$LEGACY_COURSES_MNT" "# omarchy-courses-legacy"

systemctl daemon-reload
mount "$SERIES_MNT" 2>/dev/null || mount -a -t nfs || true
mount "$COURSES_MNT" 2>/dev/null || true
mount "$LEGACY_COURSES_MNT" 2>/dev/null || true

echo "=== mounts ==="
findmnt -t nfs,nfs4 || true
ls "$SERIES_MNT" 2>/dev/null | head -5 || echo "(series not mounted yet — is Omarchy up?)"
ls "$COURSES_MNT" 2>/dev/null | head -5 || echo "(courses not mounted yet)"

ENV_FILE="$NAS_APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  set_env() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" "$ENV_FILE"; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    fi
  }
  set_env SERIES_DIR "$SERIES_MNT"
  set_env COURSES_DIR "$COURSES_MNT"
  set_env LEGACY_COURSES_DIRS "$LEGACY_COURSES_MNT"
  echo "Updated $ENV_FILE → SERIES_DIR/COURSES_DIR/LEGACY_COURSES_DIRS"

  if [ -f "$NAS_APP_DIR/docker-compose.yml" ]; then
    # Ensure compose bind-mounts the NFS paths (same path on host and in container)
    echo "Restarting MirrorMessiah so it picks up the mounts..."
    (cd "$NAS_APP_DIR" && docker compose up -d)
  fi
else
  echo "NOTE: $ENV_FILE not found. Set on the NAS:"
  echo "  SERIES_DIR=$SERIES_MNT"
  echo "  COURSES_DIR=$COURSES_MNT"
  echo "  LEGACY_COURSES_DIRS=$LEGACY_COURSES_MNT"
fi

echo "DONE. Test: ls $SERIES_MNT && curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6600/"
