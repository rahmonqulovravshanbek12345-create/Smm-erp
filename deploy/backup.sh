#!/usr/bin/env bash
# Bazaning to'liq nusxasi: /var/backups/smm-erp (faqat root o'qiy oladi), oxirgi 30 kunniki saqlanadi.
# Off-site sozlangan bo'lsa (smm-erp offsite-setup) — nusxa va maxfiy sozlamalar shifrlanib bulutga ham yuboriladi.
set -euo pipefail
DIR=/var/backups/smm-erp
TAG=${1:-kunlik}
OFFSITE=/etc/smm-erp/offsite.conf
install -d -m 700 -o root -g root "$DIR"
name="erp-$(date +%F-%H%M)-$TAG"
f="$DIR/$name.dump"
umask 077
runuser -u postgres -- pg_dump --format=custom --no-owner smmerp > "$f.tmp"
mv "$f.tmp" "$f"
# Nusxa o'qiladimi — tekshiruv
pg_restore --list "$f" > /dev/null
find "$DIR" -name 'erp-*.dump' -mtime +30 -delete
echo "Zaxira: $f ($(du -h "$f" | cut -f1))"

[ -f "$OFFSITE" ] || exit 0
# Yangilash va tiklashdan oldingi nusxa — mahalliy nusxa yetarli (bulut ishlamay qolsa ham favqulodda tiklash to'xtamasin)
case "$TAG" in yangilashdan-oldin | tiklashdan-oldin) exit 0 ;; esac
RECIPIENT='' REMOTE=''
while IFS='=' read -r k v; do
  case "$k" in RECIPIENT) RECIPIENT=$v ;; REMOTE) REMOTE=$v ;; esac
done <"$OFFSITE"
[[ "$RECIPIENT" =~ ^age1[0-9a-z]{58}$ && "$REMOTE" =~ ^[A-Za-z0-9_-]+:[A-Za-z0-9_./-]*$ ]] || { echo "✗ $OFFSITE noto'g'ri" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Ichida: baza nusxasi + /etc/smm-erp/env (SECRET_KEY'siz 2FA va tokenlarni tiklab bo'lmaydi)
tar -C "$DIR" -cf "$work/b.tar" "$name.dump" -C /etc/smm-erp env
age -r "$RECIPIENT" -o "$work/$name.tar.age" "$work/b.tar"
if ! rclone --config /etc/smm-erp/rclone.conf copyto "$work/$name.tar.age" "$REMOTE/$name.tar.age" --retries 3 --low-level-retries 5; then
  echo "✗ Off-site zaxira yuborilmadi ($REMOTE) — mahalliy nusxa saqlandi" >&2
  exit 1
fi
# Bulutda 90 kundan eskilari o'chiriladi
rclone --config /etc/smm-erp/rclone.conf delete "$REMOTE" --min-age 90d --include 'erp-*.tar.age' >/dev/null 2>&1 || true
echo "Off-site: $REMOTE/$name.tar.age (shifrlangan)"
