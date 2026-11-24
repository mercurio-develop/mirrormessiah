#!/bin/bash
# Share series + courses from Omarchy with Shambala over NFS.
# Music/movies live on the NAS; only overflow libraries are exported from here.
#
# Run with: pkexec bash scripts/setup-nfs-library-shares.sh
#        or: sudo bash scripts/setup-nfs-library-shares.sh
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: run as root (sudo/pkexec)" >&2
  exit 1
fi

EXPORTS_D=/etc/exports.d
LAN='10.0.0.0/24(ro,sync,no_subtree_check,all_squash,anonuid=1000,anongid=1000'
LAN_LEGACY='192.168.1.0/24(ro,sync,no_subtree_check,all_squash,anonuid=1000,anongid=1000'

write_export() {
  local file="$1" dir="$2" mp="$3" fsid="$4"
  if [ ! -d "$dir" ]; then
    echo "ERROR: $dir is not mounted." >&2
    exit 1
  fi
  cat > "$file" <<EOF
$dir ${LAN},fsid=$fsid,mp=$mp) ${LAN_LEGACY},fsid=$fsid,mp=$mp)
EOF
  echo "wrote $file"
}

mkdir -p "$EXPORTS_D"

write_export "$EXPORTS_D/omv-series.exports" \
  /run/media/tushita/DATA/series /run/media/tushita/DATA 104

write_export "$EXPORTS_D/omv-courses.exports" \
  /run/media/tushita/DATA/courses /run/media/tushita/DATA 101

write_export "$EXPORTS_D/omv-courses-data1.exports" \
  /run/media/tushita/DATA1/courses /run/media/tushita/DATA1 103

# Stale Photos export (path gone) — keep disabled
if [ -f "$EXPORTS_D/omv-photos.exports" ]; then
  mv "$EXPORTS_D/omv-photos.exports" "$EXPORTS_D/omv-photos.exports.disabled"
fi

# Re-export automatically when DATA / DATA1 appear after login/boot
UNIT_DIR=/etc/systemd/system
cat > "$UNIT_DIR/omarchy-nfs-library-exports.service" <<'EOF'
[Unit]
Description=Refresh Omarchy NFS library exports (series/courses)
After=local-fs.target
RequiresMountsFor=/run/media/tushita/DATA /run/media/tushita/DATA1

[Service]
Type=oneshot
ExecStart=/usr/sbin/exportfs -ra
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Also refresh when the mount units become active later (desktop automount)
cat > "$UNIT_DIR/omarchy-nfs-library-exports.path" <<'EOF'
[Unit]
Description=Watch library mountpoints and refresh NFS exports

[Path]
PathExists=/run/media/tushita/DATA/series
PathExists=/run/media/tushita/DATA1/courses

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nfs-server
systemctl enable --now omarchy-nfs-library-exports.service omarchy-nfs-library-exports.path
exportfs -ra

echo "=== exports ==="
exportfs -v
echo "DONE: series + courses shared read-only with the LAN for Shambala."
