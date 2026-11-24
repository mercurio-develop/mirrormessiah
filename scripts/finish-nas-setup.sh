#!/bin/bash
# Retries until Shambala SSH accepts a working session, then:
#  1) mounts Omarchy series/courses over NFS
#  2) deploys updated shambala-home launcher (Projects → Omarchy hub)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f /tmp/nas_ssh_agent.env ] && source /tmp/nas_ssh_agent.env || true
NAS="${NAS_SERVER:-root@10.0.0.189}"
SSH=(ssh -T -o BatchMode=yes -o ConnectTimeout=20 -o IPQoS=none -o Ciphers=aes128-ctr -o ServerAliveInterval=5)
LOG=/tmp/finish-nas-setup.log
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date) finish-nas-setup start ==="

alive() {
  out=$("${SSH[@]}" "$NAS" 'printf READY' 2>/dev/null || true)
  [[ "$out" == *READY* ]]
}

echo "Waiting for working SSH to $NAS ..."
for i in $(seq 1 120); do
  if alive; then
    echo "SSH ready on try $i"
    break
  fi
  printf '.'
  sleep 5
  if [ "$i" -eq 120 ]; then
    echo "Gave up after 10 minutes"
    exit 1
  fi
done

REMOTE_DIR=/tmp/omarchy-push
"${SSH[@]}" "$NAS" "mkdir -p $REMOTE_DIR"
rsync -az -e "${SSH[*]}" \
  scripts/nas-mount-omarchy-libraries.sh \
  ../shambala-home/site/index.html \
  "$NAS:$REMOTE_DIR/"

"${SSH[@]}" "$NAS" "bash $REMOTE_DIR/nas-mount-omarchy-libraries.sh"

"${SSH[@]}" "$NAS" bash -s <<'REMOTE'
set -e
src=/tmp/omarchy-push/index.html
# locate SHAMBALA launcher
found=$(docker ps -q | while read id; do
  docker inspect -f '{{range .Mounts}}{{println .Source}}{{end}}' "$id"
done | while read p; do
  [ -f "$p/index.html" ] && grep -q SHAMBALA "$p/index.html" 2>/dev/null && echo "$p" && break
done)
if [ -z "$found" ]; then
  found=$(find /srv /var/www -maxdepth 6 -name index.html 2>/dev/null | while read f; do
    grep -q SHAMBALA "$f" && dirname "$f" && break
  done)
fi
echo "launcher dir: ${found:-NOT_FOUND}"
if [ -n "$found" ]; then
  cp -a "$found/index.html" "$found/index.html.bak.$(date +%s)"
  cp "$src" "$found/index.html"
  grep -n data-host "$found/index.html" | head
fi
findmnt -t nfs,nfs4 || true
REMOTE

echo "=== $(date) finish-nas-setup DONE ==="
