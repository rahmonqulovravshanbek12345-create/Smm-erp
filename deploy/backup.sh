#!/usr/bin/env bash
# Bazaning to'liq nusxasi: /var/backups/smm-erp (faqat root o'qiy oladi), oxirgi 30 kunniki saqlanadi.
set -euo pipefail
DIR=/var/backups/smm-erp
TAG=${1:-kunlik}
install -d -m 700 -o root -g root "$DIR"
f="$DIR/erp-$(date +%F-%H%M)-$TAG.dump"
umask 077
runuser -u postgres -- pg_dump --format=custom --no-owner smmerp > "$f.tmp"
mv "$f.tmp" "$f"
# Nusxa o'qiladimi — tekshiruv
pg_restore --list "$f" > /dev/null
find "$DIR" -name 'erp-*.dump' -mtime +30 -delete
echo "Zaxira: $f ($(du -h "$f" | cut -f1))"
