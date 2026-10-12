#!/usr/bin/env bash
# Node.js xavfsizlik yangilanishlari (har kuni avtomatik, `sudo smm-erp node-update` — qo'lda).
# Faqat shu asosiy versiya (22.x) ichida yangilanadi. Yuklangan fayl Node.js rasmiy reliz kalitlari
# imzosi va SHA-256 xeshi bilan tekshiriladi; yangi versiyada ilova ishga tushmasa — eskisiga qaytiladi.
set -euo pipefail
MAJOR=22
# Faqat sinov uchun boshqa manzil berilishi mumkin (imzo baribir rasmiy kalitlar bilan tekshiriladi)
BASE=${SMM_ERP_NODE_DIST:-https://nodejs.org/dist}
KEYS=/opt/smm-erp/current/deploy/node-release-keys.gpg
# Ilova bilan birga kelgan kalitlar eskirsa (Node.js yangi reliz egasini qo'shsa) — kalitlar
# Node.js'ning GitHub'dagi rasmiy omboridan olinadi: soxtalashtirish uchun ikkala manbani buzish kerak bo'ladi
KEYS_FALLBACK=https://raw.githubusercontent.com/nodejs/release-keys/HEAD/gpg/pubring.kbx
APP_HEALTH=http://127.0.0.1:3000/healthz

log() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "sudo bilan ishga tushiring"

# Ilova yangilanishi bilan bir vaqtda ishlamasin
exec 9>/run/smm-erp-update.lock
flock -w 600 9 || die "Boshqa yangilash ishlayapti"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export GNUPGHOME="$work/gnupg"
install -d -m 700 "$GNUPGHOME"

cur=$(/opt/node/bin/node --version)
latest=$(curl -fsS --max-time 60 "$BASE/index.json" |
  /opt/node/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s).find(x=>x.version.startsWith(`v${process.argv[1]}.`));process.stdout.write(v?v.version:"")})' "$MAJOR")
[[ "$latest" =~ ^v$MAJOR\.[0-9]+\.[0-9]+$ ]] || die "Node.js versiyalari ro'yxati o'qilmadi"

newest=$(printf '%s\n%s\n' "$cur" "$latest" | sort -V | tail -n1)
if [ "$newest" = "$cur" ]; then
  log "Node.js $cur — eng yangi (${MAJOR}.x)"
  exit 0
fi
ver=${latest#v}
log "Node.js yangilanmoqda: $cur → $latest"

curl -fsS --max-time 60 -o "$work/SHASUMS256.txt" "$BASE/$latest/SHASUMS256.txt"
curl -fsS --max-time 60 -o "$work/SHASUMS256.txt.sig" "$BASE/$latest/SHASUMS256.txt.sig"
if ! gpgv --keyring "$KEYS" "$work/SHASUMS256.txt.sig" "$work/SHASUMS256.txt" 2>"$work/gpg.log"; then
  curl -fsS --max-time 60 -o "$work/release-keys.kbx" "$KEYS_FALLBACK" || die "Imzo kalitlari olinmadi"
  gpgv --keyring "$work/release-keys.kbx" "$work/SHASUMS256.txt.sig" "$work/SHASUMS256.txt" 2>"$work/gpg.log" ||
    { cat "$work/gpg.log" >&2; die "Node.js imzosi tasdiqlanmadi — o'rnatilmadi"; }
fi
file="node-$latest-linux-x64.tar.xz"
sum=$(awk -v f="$file" '$2 == f { print $1 }' "$work/SHASUMS256.txt")
[[ "$sum" =~ ^[0-9a-f]{64}$ ]] || die "Xesh topilmadi: $file"
curl -fsS --max-time 600 -o "$work/node.tar.xz" "$BASE/$latest/$file"
echo "$sum  $work/node.tar.xz" | sha256sum -c --quiet - || die "Yuklangan fayl xeshi mos emas — o'rnatilmadi"

dest="/opt/node-$ver"
rm -rf "$dest.tmp"
mkdir -p "$dest.tmp"
tar -xJf "$work/node.tar.xz" -C "$dest.tmp" --strip-components=1 --no-same-owner
chown -R root:root "$dest.tmp"
"$dest.tmp/bin/node" --version >/dev/null || die "Yangi Node.js ishga tushmadi"
rm -rf "$dest"
mv "$dest.tmp" "$dest"

prev=$(readlink -f /opt/node)
ln -sfn "$dest" /opt/node
systemctl restart smm-erp
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "$APP_HEALTH" >/dev/null 2>&1; then
    log "✓ Node.js $latest o'rnatildi"
    # Oldingi versiya qaytish uchun qoladi, undan eskilari o'chiriladi
    for d in /opt/node-*; do
      [ "$d" = "$dest" ] || [ "$d" = "$prev" ] || rm -rf "$d"
    done
    exit 0
  fi
  sleep 1
done
log "Yangi Node.js bilan ilova ishga tushmadi — oldingi versiyaga qaytilmoqda" >&2
ln -sfn "$prev" /opt/node
systemctl restart smm-erp
rm -rf "$dest"
die "Node.js yangilash bekor qilindi ($cur ishlayapti)"
