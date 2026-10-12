#!/usr/bin/env bash
# Yangi versiyani o'rnatish: yuklab olish → xeshni tekshirish → zaxira → almashtirish → tekshiruv.
# Yangi versiya ishlamasa — avtomatik eski versiyaga qaytadi.
set -euo pipefail
REPO=rahmonqulovravshanbek12345-create/Smm-erp
APP=/opt/smm-erp
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "sudo bilan ishga tushiring"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ -n "${SMM_ERP_TARBALL:-}" ]; then
  cp "$SMM_ERP_TARBALL" "$tmp/a.tgz"
else
  curl -fsSL "https://github.com/$REPO/releases/latest/download/smm-erp.tar.gz" -o "$tmp/a.tgz"
  curl -fsSL "https://github.com/$REPO/releases/latest/download/smm-erp.tar.gz.sha256" -o "$tmp/a.sha"
  echo "$(cut -d' ' -f1 "$tmp/a.sha")  $tmp/a.tgz" | sha256sum -c --quiet - || die "Yuklangan fayl buzilgan (xesh mos emas) — o'rnatilmadi"
fi
VER=$(tar -xzOf "$tmp/a.tgz" smm-erp/VERSION)
DEST="$APP/releases/$VER"
PREV=$(readlink -f "$APP/current")
[ "$PREV" = "$DEST" ] && { echo "Eng yangi versiya ($VER) allaqachon o'rnatilgan"; exit 0; }

echo "Yangi versiya: $VER (hozirgi: $(basename "$PREV"))"
mkdir -p "$DEST"
tar -xzmf "$tmp/a.tgz" -C "$DEST" --strip-components=1 --no-same-owner
chown -R root:root "$DEST"
chmod -R go-w "$DEST"

"$PREV/deploy/backup.sh" yangilashdan-oldin

ln -sfn "$DEST" "$APP/current"
install -m 644 "$DEST/deploy/smm-erp.service" /etc/systemd/system/smm-erp.service
install -m 644 "$DEST/deploy/smm-erp-backup.service" /etc/systemd/system/smm-erp-backup.service
install -m 644 "$DEST/deploy/smm-erp-backup.timer" /etc/systemd/system/smm-erp-backup.timer
install -m 644 "$DEST/deploy/smm-erp-node-update.service" /etc/systemd/system/smm-erp-node-update.service
install -m 644 "$DEST/deploy/smm-erp-node-update.timer" /etc/systemd/system/smm-erp-node-update.timer
install -m 755 "$DEST/deploy/smm-erp" /usr/local/bin/smm-erp
install -m 644 "$DEST/deploy/nginx-limits.conf" /etc/nginx/conf.d/smm-erp-limits.conf
install -m 644 "$DEST/deploy/nginx-proxy.conf" /etc/nginx/smm-erp-proxy.conf
systemctl daemon-reload
systemctl enable --now smm-erp-node-update.timer >/dev/null
nginx -t >/dev/null 2>&1 && systemctl reload nginx
systemctl restart smm-erp

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "✓ Yangilandi: $VER"
    # Oxirgi 5 ta versiya saqlanadi
    ls -1dt "$APP"/releases/* | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 1
done

echo "Yangi versiya ishga tushmadi — eski versiyaga qaytilmoqda" >&2
journalctl -u smm-erp -n 20 --no-pager >&2 || true
ln -sfn "$PREV" "$APP/current"
install -m 644 "$PREV/deploy/smm-erp.service" /etc/systemd/system/smm-erp.service
systemctl daemon-reload
systemctl restart smm-erp
rm -rf "$DEST"
die "Yangilash bekor qilindi, eski versiya ($(basename "$PREV")) ishlayapti"
