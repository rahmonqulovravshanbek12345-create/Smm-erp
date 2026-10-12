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

keys=0
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  [ -s "$f" ] && grep -Eq '^[^#]*(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com) AAAA' "$f" && keys=1
done
[ "$keys" = 1 ] || die "Serverda SSH kalit topilmadi — parol bilan kirish o'chirilmadi.
  Avval o'z kompyuteringizda: ssh-keygen -t ed25519   va   ssh-copy-id root@<server-IP>
  So'ng YANGI terminalda parolsiz kirishni tekshiring va bu buyruqni qayta ishga tushiring (DEPLOY.md)."

if [ "${1:-}" != "--yes" ]; then
  echo "Parol bilan SSH kirish o'chiriladi, faqat kalit bilan kirish qoladi."
  read -r -p "Kalit bilan kirish ishlashini YANGI terminal oynasida tekshirdingizmi? (ha/yo'q): " a </dev/tty
  [ "$a" = "ha" ] || die "Bekor qilindi — hech narsa o'zgarmadi"
fi

# sshd_config.d dagi fayllar alifbo tartibida o'qiladi va birinchi qiymat ustun — «01-» bulut sozlamalaridan oldin keladi
tmp=$(mktemp)
cat >"$tmp" <<'X'
# SMM ERP: faqat SSH kalit bilan kirish (smm-erp harden-ssh)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
X
had=0
[ -f "$CONF" ] && { cp "$CONF" "$CONF.bak"; had=1; }
install -m 644 "$tmp" "$CONF"
rm -f "$tmp"
install -d -m 755 -o root -g root /run/sshd
if ! sshd -t; then
  if [ "$had" = 1 ]; then mv "$CONF.bak" "$CONF"; else rm -f "$CONF"; fi
  die "SSH sozlamasida xato — o'zgarish bekor qilindi"
fi
rm -f "$CONF.bak"
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

eff=$(sshd -T 2>/dev/null)
echo "$eff" | grep -q '^passwordauthentication no' || die "Parol bilan kirish hali ham yoqilgan (boshqa sozlama ustun) — /etc/ssh/sshd_config ni tekshiring"
echo "$eff" | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|maxauthtries) '
printf '\033[1;32m✓ SSH: faqat kalit bilan kirish. Joriy ulanish uzilmaydi.\033[0m\n'
