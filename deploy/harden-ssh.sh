#!/usr/bin/env bash
# SSH himoyasi: serverga faqat SSH kalit bilan kirish (parol bilan kirish o'chiriladi — parolni taxmin qilib
# bo'lmaydi). Avval serverda kalit borligi tekshiriladi, aks holda o'zgartirilmaydi (serverdan qulflanib qolmaslik uchun).
#   sudo smm-erp harden-ssh          — so'rab tasdiqlatadi
#   sudo smm-erp harden-ssh --yes    — so'ramasdan (avtomatik o'rnatish uchun)
set -euo pipefail
CONF=/etc/ssh/sshd_config.d/01-smm-erp.conf
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "sudo bilan ishga tushiring"
command -v sshd >/dev/null || die "SSH server (sshd) topilmadi"

# Kalit shu buyruqni ishga tushirgan foydalanuvchida bo'lishi kerak (sudo bilan — o'sha foydalanuvchi, aks holda root).
# «command=» bilan cheklangan kalitlar (masalan, bulut tasvirining «Please login as…» kaliti) hisobga olinmaydi.
who=${SUDO_USER:-root}
home=$(getent passwd "$who" | cut -d: -f6)
f="$home/.ssh/authorized_keys"
keys=0
[ -s "$f" ] && grep -v 'command=' "$f" | grep -Eq '^[^#]*(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com) AAAA' && keys=1
[ "$keys" = 1 ] || die "«$who» foydalanuvchisida SSH kalit topilmadi — parol bilan kirish o'chirilmadi.
  Avval o'z kompyuteringizda: ssh-keygen -t ed25519   va   ssh-copy-id root@<server-IP>
  So'ng YANGI terminalda parolsiz kirishni tekshiring va bu buyruqni qayta ishga tushiring (DEPLOY.md)."

if [ "${1:-}" != "--yes" ]; then
  echo "Parol bilan SSH kirish o'chiriladi, faqat kalit bilan kirish qoladi."
  read -r -p "Kalit bilan kirish ishlashini YANGI terminal oynasida tekshirdingizmi? (ha/yo'q): " a </dev/tty
  [ "$a" = "ha" ] || die "Bekor qilindi — hech narsa o'zgarmadi"
fi

# sshd_config.d dagi fayllar alifbo tartibida o'qiladi va birinchi qiymat ustun — «01-» bulut sozlamalaridan oldin keladi
mkdir -p /run/sshd && chmod 755 /run/sshd
root_now=$(sshd -T 2>/dev/null | awk '$1 == "permitrootlogin" { print $2 }')
tmp=$(mktemp)
cat >"$tmp" <<'X'
# SMM ERP: faqat SSH kalit bilan kirish (smm-erp harden-ssh)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
LoginGraceTime 30
X
# Root parol bilan kira olgan bo'lsa — faqat kalit bilan; qattiqroq sozlama («no») bo'lsa — tegilmaydi.
# Qayta ishga tushirilganda oldingi qaror saqlanadi (aks holda asl «yes» qaytib kelardi).
if [ "$root_now" = "yes" ] || { [ -f "$CONF" ] && grep -q '^PermitRootLogin prohibit-password' "$CONF"; }; then
  echo "PermitRootLogin prohibit-password" >>"$tmp"
fi
had=0
[ -f "$CONF" ] && { cp "$CONF" "$CONF.bak"; had=1; }
install -m 644 "$tmp" "$CONF"
rm -f "$tmp"
if ! sshd -t; then
  if [ "$had" = 1 ]; then mv "$CONF.bak" "$CONF"; else rm -f "$CONF"; fi
  die "SSH sozlamasida xato — o'zgarish bekor qilindi"
fi
rm -f "$CONF.bak"
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

eff=$(sshd -T 2>/dev/null)
echo "$eff" | grep -q '^passwordauthentication no' || die "Parol bilan kirish hali ham yoqilgan (boshqa sozlama ustun) — /etc/ssh/sshd_config ni tekshiring"
echo "$eff" | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
printf '\033[1;32m✓ SSH: faqat kalit bilan kirish. Joriy ulanish uzilmaydi.\033[0m\n'
