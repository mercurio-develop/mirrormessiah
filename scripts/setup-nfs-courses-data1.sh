#!/bin/bash
# Share the main courses library (DATA1) with Shambala over NFS.
# Run with sudo/pkexec on Omarchy.
set -euo pipefail

EXPORTS=/etc/exports.d/omv-courses-data1.exports
DIR=/run/media/tushita/DATA1/courses
MP=/run/media/tushita/DATA1

if [ ! -d "$DIR" ]; then
  echo "ERROR: $DIR is not mounted. Plug in / log in so DATA1 is available." >&2
  exit 1
fi

mkdir -p /etc/exports.d
cat > "$EXPORTS" <<EOF
$DIR 10.0.0.0/24(ro,sync,no_subtree_check,all_squash,anonuid=1000,anongid=1000,fsid=103,mp=$MP) 192.168.1.0/24(ro,sync,no_subtree_check,all_squash,anonuid=1000,anongid=1000,fsid=103,mp=$MP)
EOF

# Ensure NFS from the LAN is allowed (idempotent)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow from 10.0.0.0/24 to any port 2049 proto tcp comment "NFS courses DATA1" >/dev/null || true
  ufw allow from 192.168.1.0/24 to any port 2049 proto tcp comment "NFS courses DATA1 legacy" >/dev/null || true
fi

systemctl enable --now nfs-server >/dev/null 2>&1 || systemctl restart nfs-server
exportfs -ra
echo "=== exports ==="
exportfs -v | grep -A1 -E 'DATA1/courses|DATA/courses' || exportfs -v
echo "DONE: $DIR is shared read-only with the LAN."
