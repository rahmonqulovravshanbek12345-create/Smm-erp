# Serverga o'rnatish va topshirish

Bu yo'riqnoma Friday Agency ERP'ni toza serverga o'rnatish, himoyalash va mijozga topshirish uchun. Xavfsizlik tafsilotlari [SECURITY.md](SECURITY.md) da.

> **Hech qachon** parol, SSH maxfiy kaliti, zaxira kaliti yoki tokenni chatga, Telegramga yoki emailga yozmang. Ular faqat serverda yoki ilovaning o'z sahifasida kiritiladi, yoki yuzma-yuz beriladi.

## Kerak bo'ladi

- Ubuntu 24.04 (x86_64) VPS, masalan Eskiz. Kamida 2 GB RAM va 20 GB disk.
- Domen, masalan `erp.fridayagency.uz`. DNS'da uning **A yozuvi** serverning IP manziliga qaratilgan bo'lishi kerak.
- O'z kompyuteringiz: Windows'da PowerShell, Mac va Linux'da Terminal.

## 1. SSH kalitini yaratish (o'z kompyuteringizda, bir marta)

Parol o'rniga kalit bilan kirish parolni taxmin qilish hujumlarini butunlay yopadi.

```bash
ssh-keygen -t ed25519            # Enter, Enter (xohlasangiz kalitga parol qo'ying)
```

Kalitni serverga qo'shish:

- **Mac/Linux:** `ssh-copy-id root@SERVER_IP`
- **Windows (PowerShell):**
  ```powershell
  type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@SERVER_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
  ```

So'ng `ssh root@SERVER_IP` buyrug'i parol so'ramasdan kirishi kerak.

## 2. Root parolini almashtirish

Hosting bergan parolni darhol almashtiring va parollar menejerida saqlang:

```bash
passwd
```

## 3. O'rnatish (bitta buyruq)

```bash
curl -fsSL https://github.com/rahmonqulovravshanbek12345-create/Smm-erp/releases/latest/download/install.sh | sudo bash
```

Skript domen, sertifikat uchun email (ixtiyoriy) va admin logini bilan ismini so'raydi. Qolganini o'zi bajaradi:

- PostgreSQL, nginx, certbot, ufw (faqat SSH, HTTP va HTTPS ochiq) va fail2ban'ni o'rnatadi.
- Avtomatik xavfsizlik yangilanishlarini yoqadi. Node.js uchun ham kunlik yangilagich ishga tushadi.
- Node.js'ni rasmiy saytdan oladi (xesh tekshiriladi), ilovani yuklaydi (xesh tekshiriladi).
- **Har bir o'rnatish uchun alohida maxfiy kalit** (`SECRET_KEY`) yaratadi: `/etc/smm-erp/env`, uni faqat root va ilova o'qiy oladi. Bazaning paroli yo'q, unga faqat server ichidan ulanish mumkin.
- Ilovani cheklangan `smmerp` foydalanuvchisi nomidan systemd xizmati sifatida ishga tushiradi.
- Har kecha 03:30 da zaxira oladi (30 kun saqlanadi).

Oxirida admin logini va **vaqtinchalik parol** chiqadi. Uni hech qayerga yozmang, birinchi kirishda u almashtiriladi.

## 4. HTTPS

Domen serverga ulangan bo'lsa, sertifikat o'rnatish paytida olinadi. Ulanmagan bo'lsa, DNS tarqalgandan keyin buni bajaring:

```bash
sudo smm-erp https sizning@email.uz
```

Sertifikat avtomatik yangilanadi. HTTPS bo'lmasa, tizimga kirib bo'lmaydi, bu ataylab shunday qilingan.

## 5. Birinchi kirish

1. `https://erp.fridayagency.uz` sahifasini oching va admin logini hamda vaqtinchalik parol bilan kiring.
2. Yangi parol o'rnating: kamida 10 belgi, harf va raqam bo'lsin.
3. Telefonga Google Authenticator yoki shunga o'xshash ilovani o'rnatib, QR kodni skanerlang. **2FA hamma xodimlar uchun majburiy.**

## 6. SSH'ni faqat kalit bilan qoldirish

1-qadamdagi kalit bilan kirish ishlayotganini **yangi terminal oynasida** tekshiring, keyin:

```bash
sudo smm-erp harden-ssh
```

Serverda kalit bo'lmasa, buyruq hech narsani o'zgartirmaydi va sababini aytadi. Shu sababli serverdan qulflanib qolmaysiz.

## 7. Serverdan tashqaridagi shifrlangan zaxira (majburiy)

Server yo'qolsa yoki buzilsa, ma'lumotni faqat shu nusxa qutqaradi.

```bash
sudo smm-erp offsite-setup
```

1. Skript **zaxirani ochish kalitini** (`AGE-SECRET-KEY-…`) bir marta ko'rsatadi. Uni ikki joyda saqlang, masalan parollar menejeri va seyfdagi qog'oz. Kalit serverda saqlanmaydi. Kalitsiz zaxirani hech kim, siz ham ocha olmaysiz.
2. Keyin bulut xotirasi ulanadi (rclone). Eng sodda yo'l **Backblaze B2** (10 GB bepul): B2 sahifasida xususiy (Private) bucket va unga «Application Key» yarating. rclone menyusida `n` → nom (masalan, `zaxira`) → «b2» turini tanlang → keyID va applicationKey'ni kiriting → qolgan savollarga Enter → `q`. Skript so'raganda nomni (`zaxira`) va bucket nomini yozing. **Google Drive** bilan ham ishlaydi: «drive» turini tanlang. «Use auto config?» savoliga `n` deb javob bering, chiqqan `rclone authorize …` buyrug'ini brauzeri bor kompyuterda bajaring.
3. Sinov uchun darhol bitta zaxira yuboriladi. Keyin har kecha avtomatik yuboriladi, bulutda 90 kun saqlanadi.

Zaxira ichida baza nusxasi va `/etc/smm-erp/env` (`SECRET_KEY`) bor: kalitsiz 2FA va tokenlarni tiklab bo'lmaydi. Ro'yxat: `sudo smm-erp offsite-list`.

> **Tavsiya:** Backblaze'da bucket yaratayotganda «Object Lock»ni yoqing va standart saqlash muddatini 90 kun qiling. Shunda server buzilgan taqdirda ham bulutdagi nusxalarni muddatidan oldin hech kim o'chira olmaydi. Sozlash oxiridagi sinov yuborishi bu sozlama bilan ham ishlayotganini ko'rsatadi.

## 8. Telegram va Meta

- **Telegram:** @BotFather'da bot yarating. Tokenni **faqat** Admin → Telegram sahifasiga kiriting, chatga yozmang. Har bir xodim botga `/start` yuboradi, admin ularning chat ID raqamlarini kiritadi. Sinov tugmasi xabar kelishini tekshiradi.
- **Meta Ads:** tokenni **faqat** Integratsiyalar sahifasiga kiriting. Tokenlar bazada shifrlangan holda saqlanadi va brauzerga qaytib chiqmaydi.

## 9. Xodimlar

Admin → Xodimlar bo'limida xodim qo'shiladi va unga login beriladi. Ekranda vaqtinchalik parol chiqadi, uni xodimga **yuzma-yuz** bering. Xodim birinchi kirishda parolini almashtiradi va 2FA'ni ulaydi. Ishdan ketgan xodimni arxivlang: uning sessiyalari darhol yopiladi.

## Kundalik boshqaruv

| Buyruq                                        | Nima qiladi                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sudo smm-erp status`                         | Tizim ishlayaptimi                                                                                                                                  |
| `sudo smm-erp logs [N]`                       | Oxirgi xabarlar                                                                                                                                     |
| `sudo smm-erp update <versiya> <sha256>`      | Yangi versiya. Buyruq reliz izohida tayyor turadi; xeshni dasturchidan boshqa kanal orqali tasdiqlang. Oldin zaxira oladi, ishlamasa orqaga qaytadi |
| `sudo smm-erp update`                         | Faqat hozirgi va eng yangi versiyani ko'rsatadi, hech narsa o'rnatmaydi                                                                             |
| `sudo smm-erp node-update`                    | Node.js xavfsizlik yangilanishi. Har kuni 04:20 da avtomatik ham ishlaydi                                                                           |
| `sudo smm-erp backup` / `backups`             | Hozir zaxira olish / zaxiralar ro'yxati                                                                                                             |
| `sudo smm-erp restore <fayl>`                 | Zaxiradan tiklash. Hozirgi baza ham saqlab qo'yiladi                                                                                                |
| `sudo smm-erp offsite-setup` / `offsite-list` | Bulutga shifrlangan zaxira                                                                                                                          |
| `sudo smm-erp harden-ssh`                     | SSH'ga faqat kalit bilan kirish                                                                                                                     |
| `sudo smm-erp reset-password <login>`         | Xodimga yangi vaqtinchalik parol                                                                                                                    |
| `sudo smm-erp reset-2fa <login>`              | Telefon yo'qolsa: 2FA'ni o'chirish (keyingi kirishda qayta ulanadi)                                                                                 |
| `sudo smm-erp unlock <login>`                 | Noto'g'ri urinishlar sababli qo'yilgan blokni olib tashlash                                                                                         |

Kuzatish: `systemctl list-timers | grep smm-erp` (zaxira va Node.js taymerlari), `systemctl --failed` (ishlamay qolgan xizmat). Ma'lumot hajmi 50 MB dan oshsa, adminga tizimda va Telegramda ogohlantirish keladi.

- **Xodim «kunlik chegaraga yetdingiz» deb yozsa:** u bir kunda juda ko'p ma'lumot (standart 5 MB) qo'shgan. Avval Admin → Xavfsizlik jurnalida nima qo'shilganini tekshiring. Ish haqiqiy bo'lsa: `sudo smm-erp restart` (hisoblagichlar nolga tushadi) yoki chegarani `USER_DAILY_WRITE_MB` bilan oshiring.
- **Butun ofis saytga kira olmay qolsa:** bitta IP'dan 10 daqiqada 20 marta noto'g'ri parol kiritilsa, fail2ban o'sha IP'ni 1 soatga bloklaydi. Ochish uchun: `sudo fail2ban-client set smm-erp-login unbanip <IP>`. Ofis IP'si doimiy bo'lsa, uni `/etc/fail2ban/jail.d/smm-erp.conf` ga `ignoreip = 127.0.0.1/8 ::1 <ofis-IP>` qatori bilan qo'shing.
- **Node.js yangilanishi ishlamasa:** yangilagich eski versiyaga qaytadi va o'sha versiyani qayta o'rnatmaydi. Sababni tuzatgach, `sudo smm-erp node-update --force` bilan qayta urinib ko'ring.

## Bu versiyadan oldin o'rnatilgan serverni yangilash

Server 2026-yil 12-oktabrdan oldingi versiya bilan o'rnatilgan bo'lsa, undagi eski `update` buyrug'i yangi xavfsizlik qismlarini o'rnatmaydi: Node.js yangilagichi, fail2ban qoidasi, 2FA hamma uchun. Shuning uchun bir marta o'rnatish buyrug'ini qayta ishga tushiring:

```bash
curl -fsSL https://github.com/rahmonqulovravshanbek12345-create/Smm-erp/releases/latest/download/install.sh | sudo bash
```

Buyruqni qayta ishga tushirish xavfsiz: ma'lumot, `/etc/smm-erp/env`, sertifikat va adminlar o'zgarmaydi, faqat ilova va tizim fayllari yangilanadi. So'ng `/etc/smm-erp/env` dagi `REQUIRE_2FA_ROLES=` qatorini `REQUIRE_2FA_ROLES=all` ga o'zgartiring va `sudo systemctl restart smm-erp` bajaring.

## Tiklash

**Shu serverda** (masalan, xato o'zgarishdan keyin):

```bash
sudo smm-erp backups
sudo smm-erp restore /var/backups/smm-erp/erp-YYYY-MM-DD-HHMM-kunlik.dump
```

**Yangi serverda** (eski server yo'qolgan bo'lsa):

1. 1–4 qadamlarni yangi serverda bajaring. Admin yaratish savoliga istalgan login bering, u keyin tiklangan baza bilan almashadi.
2. Bulutdan oxirgi `erp-…tar.age` faylini oling, masalan `rclone copy` bilan yoki bulut sahifasidan yuklab olib `scp` orqali serverga o'tkazing.
3. Faylni ochish kaliti bilan oching:
   ```bash
   nano /root/kalit.txt                          # AGE-SECRET-KEY-… qatorini joylang
   mkdir -p /root/tiklash
   age -d -i /root/kalit.txt erp-….tar.age | tar -x -C /root/tiklash
   shred -u /root/kalit.txt
   ```
4. `/root/tiklash/env` faylidagi `SECRET_KEY=` qatorini `/etc/smm-erp/env` dagi shu qatorning o'rniga qo'ying, keyin `sudo systemctl restart smm-erp` bajaring.
5. Bazani tiklang: `sudo smm-erp restore /root/tiklash/erp-….dump`.
6. Kirib tekshiring, keyin `rm -r /root/tiklash` bajaring va 6–7 qadamlarni yangi serverda takrorlang.

Zaxirani yiliga kamida bir marta shu tartibda sinab ko'ring.

## Sozlamalar (`/etc/smm-erp/env`)

| O'zgaruvchi           | Standart           | Ma'nosi                                                                       |
| --------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `APP_ORIGIN`          | `https://<domen>`  | Sayt manzili (boshqa saytdan so'rovni rad etish uchun)                        |
| `SECRET_KEY`          | tasodifiy, 32 bayt | 2FA kalitlari va tokenlarni shifrlaydi. **Yo'qolsa, ularni tiklab bo'lmaydi** |
| `REQUIRE_2FA_ROLES`   | `all`              | 2FA majburiy rollar                                                           |
| `USER_DAILY_WRITE_MB` | `5`                | Bitta xodim bir kunda qo'sha oladigan ma'lumot hajmi (admin cheklanmaydi)     |
| `COOKIE_SECURE`       | `1`                | Cookie faqat HTTPS orqali. O'zgartirmang                                      |

O'zgartirgandan keyin `sudo systemctl restart smm-erp` bajaring.

## Mijozga topshirishdan oldingi checklist

- [ ] DNS A yozuvi serverga qaratilgan, `https://…` qulf belgisi bilan ochiladi (`sudo smm-erp https`)
- [ ] SSH kaliti qo'shilgan va `sudo smm-erp harden-ssh` bajarilgan. Root paroli almashtirilgan va mijozda saqlanadi
- [ ] Hosting (Eskiz) panelida kuchli parol, imkoni bo'lsa 2FA
- [ ] Admin birinchi kirishda parolni almashtirgan va 2FA'ni ulagan
- [ ] `sudo smm-erp offsite-setup` bajarilgan. Zaxira kaliti mijozda ikki joyda saqlanadi, sinov nusxasi bulutda ko'rinadi
- [ ] Zaxiradan tiklash bir marta sinab ko'rilgan (yuqoridagi tartib)
- [ ] Telegram tokeni Admin sahifasida kiritilgan, sinov xabari kelgan. Meta tokeni Integratsiyalar sahifasida kiritilgan
- [ ] Xodimlarga loginlar yuzma-yuz berilgan. Har biri parolni almashtirgan va 2FA'ni ulagan
- [ ] `sudo smm-erp status` yaxshi, `systemctl list-timers | grep smm-erp` da ikkala taymer bor, `systemctl --failed` bo'sh
- [ ] GitHub akkauntida 2FA yoqilgan (yoki repozitoriy agentlikning o'z akkauntiga ko'chirilgan)
- [ ] Mijozga topshirildi: shu hujjat, [SECURITY.md](SECURITY.md) (ayniqsa «Ma'lum xavflar» bo'limi), zaxira kaliti va admin kirishi (yuzma-yuz)
