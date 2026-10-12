#!/usr/bin/env bash
# Yangi versiyani o'rnatish: sudo smm-erp update <versiya> <sha256>
# Faqat aniq ko'rsatilgan versiya va oldindan ma'lum xesh bilan (avtomatik «eng oxirgisi» o'rnatilmaydi —
# GitHub akkaunti buzilsa ham serverga begona kod o'zi kirib kelmaydi). Yuklab olish → xesh → zaxira →
# almashtirish → tekshiruv; yangi versiya ishlamasa — avtomatik eski versiyaga qaytadi.
set -euo pipefail
REPO=rahmonqulovravshanbek12345-create/Smm-erp
APP=/opt/smm-erp
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "sudo bilan ishga tushiring"

WANT=${1:-}
SUM=${2:-}
if [ -z "$WANT" ]; then
  echo "Hozirgi versiya: $(cat "$APP/current/VERSION" 2>/dev/null || basename "$(readlink -f "$APP/current")")"
  latest=$(curl -fsS --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n1 || true)
  [ -n "$latest" ] && echo "GitHub'dagi eng yangi versiya: $latest"
  cat <<'HELP'

Yangilash: sudo smm-erp update <versiya> <sha256>
  versiya va sha256 — reliz sahifasidagi «Serverda yangilash» qatoridan. Xeshni ishonchli kanaldan
  (masalan, dasturchining o'zidan) tekshirib oling: xesh mos kelmasa, hech narsa o'rnatilmaydi.
HELP
  exit 0
fi
WANT=${WANT#v}
[[ "$SUM" =~ ^[0-9a-f]{64}$ ]] || die "SHA-256 xesh kerak (64 ta belgi): sudo smm-erp update <versiya> <sha256>"
[[ "$WANT" =~ ^[0-9A-Za-z._-]{1,64}$ ]] || die "Versiya noto'g'ri: $WANT"

# Node.js yangilagichi bilan bir vaqtda ishlamasin
exec 9>/run/smm-erp-update.lock
flock -w 600 9 || die "Boshqa yangilash ishlayapti"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ -n "${SMM_ERP_TARBALL:-}" ]; then
  cp "$SMM_ERP_TARBALL" "$tmp/a.tgz"
else
  curl -fsSL "https://github.com/$REPO/releases/download/v$WANT/smm-erp.tar.gz" -o "$tmp/a.tgz" || die "Versiya $WANT topilmadi"
fi
echo "$SUM  $tmp/a.tgz" | sha256sum -c --quiet - 2>/dev/null || die "Xesh mos emas — fayl soxta yoki buzilgan. Hech narsa o'rnatilmadi"
VER=$(tar -xzOf "$tmp/a.tgz" smm-erp/VERSION)
[ -n "${SMM_ERP_TARBALL:-}" ] || [ "$VER" = "$WANT" ] || die "Paket ichidagi versiya ($VER) so'ralganiga ($WANT) mos emas"
[[ "$VER" =~ ^[0-9A-Za-z._-]{1,64}$ ]] || die "Paket versiyasi noto'g'ri"
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
install -d /etc/fail2ban/filter.d /etc/fail2ban/jail.d /var/log/nginx
touch /var/log/nginx/access.log
install -m 644 "$DEST/deploy/fail2ban-filter.conf" /etc/fail2ban/filter.d/smm-erp-login.conf
install -m 644 "$DEST/deploy/fail2ban-jail.conf" /etc/fail2ban/jail.d/smm-erp.conf
install -m 644 "$DEST/deploy/nginx-limits.conf" /etc/nginx/conf.d/smm-erp-limits.conf
install -m 644 "$DEST/deploy/nginx-proxy.conf" /etc/nginx/smm-erp-proxy.conf
systemctl daemon-reload
systemctl enable --now smm-erp-node-update.timer >/dev/null
nginx -t >/dev/null 2>&1 && systemctl reload nginx
systemctl reload fail2ban >/dev/null 2>&1 || true
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
# Eski versiyaning barcha tizim fayllari qaytariladi (yangisining buyrug'i yoki taymeri qolib ketmasin)
for u in smm-erp.service smm-erp-backup.service smm-erp-backup.timer smm-erp-node-update.service smm-erp-node-update.timer; do
  if [ -f "$PREV/deploy/$u" ]; then
    install -m 644 "$PREV/deploy/$u" "/etc/systemd/system/$u"
  else
    systemctl disable --now "$u" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$u"
  fi
done
install -m 755 "$PREV/deploy/smm-erp" /usr/local/bin/smm-erp
install -m 644 "$PREV/deploy/nginx-limits.conf" /etc/nginx/conf.d/smm-erp-limits.conf
install -m 644 "$PREV/deploy/nginx-proxy.conf" /etc/nginx/smm-erp-proxy.conf
if [ -f "$PREV/deploy/fail2ban-filter.conf" ]; then
  install -m 644 "$PREV/deploy/fail2ban-filter.conf" /etc/fail2ban/filter.d/smm-erp-login.conf
  install -m 644 "$PREV/deploy/fail2ban-jail.conf" /etc/fail2ban/jail.d/smm-erp.conf
else
  rm -f /etc/fail2ban/filter.d/smm-erp-login.conf /etc/fail2ban/jail.d/smm-erp.conf
fi
systemctl daemon-reload
nginx -t >/dev/null 2>&1 && systemctl reload nginx
systemctl reload fail2ban >/dev/null 2>&1 || true
systemctl restart smm-erp
rm -rf "$DEST"
for _ in $(seq 1 30); do
  curl -fsS --max-time 2 http://127.0.0.1:3000/healthz >/dev/null 2>&1 && die "Yangilash bekor qilindi, eski versiya ($(basename "$PREV")) ishlayapti"
  sleep 1
done
die "Yangilash bekor qilindi va eski versiyaga qaytildi, lekin ilova javob bermayapti — sudo smm-erp logs"
