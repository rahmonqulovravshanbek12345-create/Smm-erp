#!/usr/bin/env bash
# Serverdan tashqaridagi (off-site) shifrlangan zaxira: har kungi zaxira + maxfiy sozlamalar (SECRET_KEY)
# age bilan shifrlanadi va rclone orqali bulutga (Google Drive, S3, Backblaze, boshqa server…) yuboriladi.
# Shifrni ochadigan maxfiy kalit serverda SAQLANMAYDI — u faqat egasida (server buzilsa ham zaxira o'qilmaydi).
#   sudo smm-erp offsite-setup     — sozlash (bir marta)
#   sudo smm-erp offsite-list      — bulutdagi zaxiralar ro'yxati
# Avtomatik sozlash (muhit o'zgaruvchilari): SMM_ERP_OFFSITE_RECIPIENT=age1…  SMM_ERP_OFFSITE_REMOTE=nom:papka
set -euo pipefail
CONF=/etc/smm-erp/offsite.conf
RCLONE_CONF=/etc/smm-erp/rclone.conf
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "sudo bilan ishga tushiring"

need_tools() {
  command -v age >/dev/null && command -v rclone >/dev/null && return
  echo "age va rclone o'rnatilmoqda…"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq age rclone >/dev/null
}

case "${1:-}" in
  setup)
    need_tools
    recipient=${SMM_ERP_OFFSITE_RECIPIENT:-}
    if [ -z "$recipient" ]; then
      k=$(mktemp)
      age-keygen -o "$k" 2>/dev/null
      recipient=$(age-keygen -y "$k")
      cat <<X

════════════════════════ ZAXIRANI OCHISH KALITI ════════════════════════
Quyidagi kalitni HOZIROQ xavfsiz joyga saqlang (parollar menejeri yoki qog'ozda seyfda).
U serverda saqlanmaydi. Kalitsiz bulutdagi zaxirani hech kim, siz ham ocha olmaysiz.

$(grep '^AGE-SECRET-KEY-' "$k")

════════════════════════════════════════════════════════════════════════
X
      shred -u "$k" 2>/dev/null || rm -f "$k"
      read -r -p "Kalitni saqlab qo'ydingizmi? (ha/yo'q): " a </dev/tty
      [ "$a" = "ha" ] || die "Bekor qilindi — kalit saqlanmagani uchun sozlash to'xtatildi"
    fi
    [[ "$recipient" =~ ^age1[0-9a-z]{58}$ ]] || die "age ochiq kaliti noto'g'ri: $recipient"

    remote=${SMM_ERP_OFFSITE_REMOTE:-}
    if [ -z "$remote" ]; then
      cat <<'X'

Endi bulut xotirasini ulaymiz (rclone). Ochilgan menyuda: «n» (yangi) → nom bering (masalan, zaxira)
→ turini tanlang (Google Drive: «drive», Amazon/Backblaze/Wasabi: «s3»…) → ko'rsatmalarga amal qiling.
Ulash tugagach, «q» bilan chiqing.
X
      touch "$RCLONE_CONF" && chmod 600 "$RCLONE_CONF"
      rclone config --config "$RCLONE_CONF"
      read -r -p "Ulangan nom (masalan, zaxira): " name </dev/tty
      remote="${name}:smm-erp-zaxira"
    fi
    [[ "$remote" =~ ^[A-Za-z0-9_-]+:[A-Za-z0-9_./-]*$ ]] || die "Manzil noto'g'ri: $remote (masalan, zaxira:smm-erp-zaxira)"
    [ -f "$RCLONE_CONF" ] && chmod 600 "$RCLONE_CONF"
    umask 077
    printf 'RECIPIENT=%s\nREMOTE=%s\n' "$recipient" "$remote" >"$CONF"
    chmod 600 "$CONF"
    echo "Sinov: hozir zaxira olinib, bulutga yuboriladi…"
    /opt/smm-erp/current/deploy/backup.sh offsite-sinov
    printf '\033[1;32m✓ Off-site zaxira sozlandi: har kecha 03:30 da %s ga shifrlab yuboriladi (90 kun saqlanadi)\033[0m\n' "$remote"
    ;;
  list)
    [ -f "$CONF" ] || die "Off-site zaxira sozlanmagan: sudo smm-erp offsite-setup"
    # shellcheck disable=SC1090
    . "$CONF"
    rclone --config "$RCLONE_CONF" lsl "$REMOTE"
    ;;
  *)
    die "Foydalanish: smm-erp offsite-setup | offsite-list"
    ;;
esac
