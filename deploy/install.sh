#!/usr/bin/env bash
# SMM ERP: toza Ubuntu 24.04 serverga o'rnatish (bir marta). Ishga tushirish:
#   curl -fsSL https://github.com/rahmonqulovravshanbek12345-create/Smm-erp/releases/latest/download/install.sh | sudo bash
# Qayta ishga tushirish xavfsiz: bor narsa o'zgartirilmaydi (ma'lumot o'chirilmaydi).
set -euo pipefail

REPO=rahmonqulovravshanbek12345-create/Smm-erp
NODE_VER=22.23.3
NODE_SHA256=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de
APP=/opt/smm-erp
ENVF=/etc/smm-erp/env

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# Savol: javob muhit o'zgaruvchisida berilgan bo'lsa (avtomatik o'rnatish) — so'ralmaydi
ask() {
  local var=$1 q=$2 def=${3:-} a
  if [ -n "${!var+x}" ]; then printf '%s' "${!var}"; return; fi
  read -r -p "  $q${def:+ [$def]}: " a </dev/tty
  printf '%s' "${a:-$def}"
}

[ "$(id -u)" = 0 ] || die "root sifatida ishga tushiring (sudo)"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "Bu skript faqat Ubuntu uchun"
[ "$(uname -m)" = x86_64 ] || die "Faqat x86_64 server qo'llab-quvvatlanadi"

say "Sozlamalar"
DOMAIN=${1:-$(ask SMM_ERP_DOMAIN "Sayt manzili (domen)" "erp.fridayagency.uz")}
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Domen noto'g'ri: $DOMAIN"

say "1/9 Tizim paketlari (bir necha daqiqa)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades curl ca-certificates xz-utils >/dev/null
timedatectl set-timezone Asia/Tashkent || true
ok "PostgreSQL, nginx, certbot, ufw, fail2ban"

say "2/9 Avtomatik xavfsizlik yangilanishlari"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'X'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
X
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "yoqildi"

say "3/9 Node.js $NODE_VER (rasmiy, imzo xeshi tekshiriladi)"
# Avtomatik yangilagich ancha yangi versiya o'rnatgan bo'lsa — eskisiga qaytarilmaydi
NODE_CUR=$(/opt/node/bin/node --version 2>/dev/null || echo v0)
if [ "$(printf '%s\n%s\n' "$NODE_CUR" "v$NODE_VER" | sort -V | tail -n1)" = "v$NODE_VER" ] && [ "$NODE_CUR" != "v$NODE_VER" ]; then
  if [ ! -x "/opt/node-$NODE_VER/bin/node" ]; then
    tmp=$(mktemp -d)
    curl -fsSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" -o "$tmp/node.tar.xz"
    echo "$NODE_SHA256  $tmp/node.tar.xz" | sha256sum -c --quiet - || die "Node.js fayli buzilgan yoki soxta (xesh mos emas)"
    mkdir -p "/opt/node-$NODE_VER"
    tar -xJf "$tmp/node.tar.xz" -C "/opt/node-$NODE_VER" --strip-components=1 --no-same-owner
    rm -rf "$tmp"
  fi
  ln -sfn "/opt/node-$NODE_VER" /opt/node
fi
ok "$(/opt/node/bin/node --version) (xavfsizlik yangilanishlari har kuni avtomatik o'rnatiladi)"

say "4/9 Ilova foydalanuvchisi va baza"
id smmerp >/dev/null 2>&1 || useradd --system --home-dir /var/lib/smm-erp --create-home --shell /usr/sbin/nologin smmerp
systemctl enable --now postgresql >/dev/null
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='smmerp'" | grep -q 1; then
  runuser -u postgres -- psql -qc "CREATE ROLE smmerp LOGIN"
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='smmerp'" | grep -q 1; then
  runuser -u postgres -- createdb -O smmerp smmerp
fi
# Baza faqat server ichidan (tashqi tarmoqdan ulanib bo'lmaydi)
PGCONF=$(runuser -u postgres -- psql -tAc "SHOW config_file")
grep -Eq "^\s*listen_addresses\s*=" "$PGCONF" && sed -i -E "s/^\s*listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$PGCONF" || true
ok "smmerp (parolsiz, faqat shu serverdagi smmerp foydalanuvchisi ulanadi)"

say "5/9 Ilovani yuklab olish"
tmp=$(mktemp -d)
if [ -n "${SMM_ERP_TARBALL:-}" ]; then
  cp "$SMM_ERP_TARBALL" "$tmp/a.tgz"
else
  curl -fsSL "https://github.com/$REPO/releases/latest/download/smm-erp.tar.gz" -o "$tmp/a.tgz"
  curl -fsSL "https://github.com/$REPO/releases/latest/download/smm-erp.tar.gz.sha256" -o "$tmp/a.sha"
  echo "$(cut -d' ' -f1 "$tmp/a.sha")  $tmp/a.tgz" | sha256sum -c --quiet - || die "Yuklangan fayl buzilgan (xesh mos emas)"
fi
VER=$(tar -xzOf "$tmp/a.tgz" smm-erp/VERSION)
DEST="$APP/releases/$VER"
mkdir -p "$DEST"
tar -xzmf "$tmp/a.tgz" -C "$DEST" --strip-components=1 --no-same-owner
chown -R root:root "$APP"
chmod -R go-w "$APP"
ln -sfn "$DEST" "$APP/current"
rm -rf "$tmp"
ok "versiya $VER"

say "6/9 Maxfiy sozlamalar"
if [ ! -f "$ENVF" ]; then
  install -d -m 750 -o root -g smmerp /etc/smm-erp
  umask 027
  cat >"$ENVF" <<X
DATABASE_URL=postgresql://smmerp@/smmerp?host=/var/run/postgresql
APP_ORIGIN=https://$DOMAIN
SECRET_KEY=$(head -c 32 /dev/urandom | base64)
STATIC_DIR=$APP/current/public
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=1
REQUIRE_2FA_ROLES=all
LOG_LEVEL=info
X
  umask 022
  chown root:smmerp "$ENVF"
  chmod 640 "$ENVF"
  ok "yaratildi: $ENVF (faqat root va ilova o'qiy oladi)"
else
  ok "bor — o'zgartirilmadi"
fi

say "7/9 Xizmatlar"
install -m 644 "$APP/current/deploy/smm-erp.service" /etc/systemd/system/smm-erp.service
install -m 644 "$APP/current/deploy/smm-erp-backup.service" /etc/systemd/system/smm-erp-backup.service
install -m 644 "$APP/current/deploy/smm-erp-backup.timer" /etc/systemd/system/smm-erp-backup.timer
install -m 644 "$APP/current/deploy/smm-erp-node-update.service" /etc/systemd/system/smm-erp-node-update.service
install -m 644 "$APP/current/deploy/smm-erp-node-update.timer" /etc/systemd/system/smm-erp-node-update.timer
install -m 755 "$APP/current/deploy/smm-erp" /usr/local/bin/smm-erp
install -d /etc/fail2ban/filter.d /etc/fail2ban/jail.d /var/log/nginx
touch /var/log/nginx/access.log
install -m 644 "$APP/current/deploy/fail2ban-filter.conf" /etc/fail2ban/filter.d/smm-erp-login.conf
install -m 644 "$APP/current/deploy/fail2ban-jail.conf" /etc/fail2ban/jail.d/smm-erp.conf
systemctl daemon-reload
systemctl enable --now smm-erp-backup.timer >/dev/null
systemctl enable --now smm-erp-node-update.timer >/dev/null
systemctl enable smm-erp >/dev/null
systemctl restart smm-erp
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/healthz >/dev/null 2>&1 && break
  sleep 1
  [ "$i" = 30 ] && { journalctl -u smm-erp -n 30 --no-pager; die "Ilova ishga tushmadi (yuqoridagi xabarga qarang)"; }
done
ok "ilova ishlayapti (127.0.0.1:3000 — tashqaridan faqat nginx orqali)"

say "8/9 Veb-server (nginx), xavfsizlik devori (ufw), fail2ban"
install -m 644 "$APP/current/deploy/nginx-limits.conf" /etc/nginx/conf.d/smm-erp-limits.conf
install -m 644 "$APP/current/deploy/nginx-proxy.conf" /etc/nginx/smm-erp-proxy.conf
if [ ! -f /etc/nginx/sites-available/smm-erp ]; then
  sed "s/__DOMAIN__/$DOMAIN/g" "$APP/current/deploy/nginx-site.conf" >/etc/nginx/sites-available/smm-erp
  # IPv6 o'chirilgan serverda [::] manzili nginx'ni to'xtatib qo'yadi
  [ -f /proc/net/if_inet6 ] || sed -i '/listen \[::\]/d' /etc/nginx/sites-available/smm-erp
fi
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/erp
ln -sfn /etc/nginx/sites-available/smm-erp /etc/nginx/sites-enabled/smm-erp
nginx -t >/dev/null 2>&1 || { nginx -t; die "nginx sozlamasida xato"; }
systemctl enable --now nginx >/dev/null
systemctl reload nginx
# SSH avval ochiladi — aks holda devor yoqilganda serverga ulanish uzilib qolardi
SSH_PORT=$( (sshd -T 2>/dev/null || true) | awk '/^port /{print $2; exit}')
ufw allow "${SSH_PORT:-22}/tcp" >/dev/null
ufw allow 'Nginx Full' >/dev/null 2>&1 || { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; }
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true
systemctl reload fail2ban >/dev/null 2>&1 || systemctl restart fail2ban >/dev/null 2>&1 || true
ok "faqat SSH, HTTP va HTTPS ochiq"

say "9/9 HTTPS sertifikat"
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  ok "bor"
else
  EMAIL=$(ask SMM_ERP_EMAIL "Sertifikat ogohlantirishlari uchun email (ixtiyoriy, Enter — o'tkazish)" "")
  if smm-erp https "$EMAIL"; then ok "HTTPS yoqildi"; else warn "HTTPS hozircha olinmadi — domen serverga ulanganini kuting va keyin: sudo smm-erp https"; fi
fi

if ! smm-erp check | grep -q "versiya"; then
  say "Birinchi admin"
  LOGIN=$(ask SMM_ERP_ADMIN_LOGIN "Admin logini (lotin harflari, masalan ravshan)" "")
  NAME=$(ask SMM_ERP_ADMIN_NAME "Admin ismi familiyasi" "Administrator")
  smm-erp init "$LOGIN" "$NAME"
  systemctl restart smm-erp
fi

printf '\n\033[1;32m✓ Tayyor!\033[0m  Sayt: https://%s\n' "$DOMAIN"
echo "  Boshqaruv: sudo smm-erp help    ·    Zaxiralar: har kecha 03:30, /var/backups/smm-erp"
