# Serverga o'rnatish (Eskiz VPS, Ubuntu 24.04)

## Kerak bo'ladi

- Ubuntu 24.04 server (root yoki sudo huquqi bilan kirish).
- Domen (masalan `erp.fridayagency.uz`) serverning IP manziliga ulangan bo'lishi kerak: DNS'da A yozuvi.

## O'rnatish: bitta buyruq

Serverga SSH orqali kiring va quyidagini yozing:

```bash
curl -fsSL https://github.com/rahmonqulovravshanbek12345-create/Smm-erp/releases/latest/download/install.sh | sudo bash
```

Skript uchta savol beradi: domen, sertifikat uchun email (ixtiyoriy) va admin logini bilan ismi. Qolganini o'zi bajaradi:

1. PostgreSQL, nginx, certbot, xavfsizlik devori (ufw) va fail2ban'ni o'rnatadi.
2. Avtomatik xavfsizlik yangilanishlarini yoqadi.
3. Node.js'ni rasmiy saytdan yuklab oladi va fayl xeshini tekshiradi.
4. `smmerp` foydalanuvchisi va bazani yaratadi. Baza parolsiz ishlaydi va faqat server ichidan ulanadi.
5. Ilovani yuklab oladi (xesh tekshiriladi).
6. Maxfiy kalitlarni yaratadi: `/etc/smm-erp/env`, uni faqat root o'qiy oladi.
7. Ilovani himoyalangan systemd xizmati sifatida ishga tushiradi.
8. nginx'ni sozlaydi va faqat SSH, HTTP hamda HTTPS portlarini ochiq qoldiradi.
9. HTTPS sertifikatini oladi (Let's Encrypt, bepul, avtomatik yangilanadi).

Oxirida admin logini va **vaqtinchalik parol** ko'rsatiladi. Birinchi kirishda yangi parol o'rnatiladi va telefonda Google Authenticator ulanadi.

> Parolni hech kimga yozma ravishda yubormang: chatga ham, Telegramga ham. Xodimlarga loginni Admin sahifasidan berasiz.

## Kundalik boshqaruv

| Buyruq                                | Nima qiladi                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `sudo smm-erp status`                 | Ishlayaptimi                                                                                            |
| `sudo smm-erp update`                 | Yangi versiyani o'rnatadi. Oldin bekap oladi; yangi versiya ishlamasa, avtomatik eski versiyaga qaytadi |
| `sudo smm-erp backup`                 | Hozir bekap oladi (bundan tashqari har kecha 03:30 da avtomatik, 30 kun saqlanadi)                      |
| `sudo smm-erp backups`                | Bekaplar ro'yxati                                                                                       |
| `sudo smm-erp restore <fayl>`         | Bekapdan tiklaydi. Hozirgi baza ham saqlab qo'yiladi                                                    |
| `sudo smm-erp reset-password <login>` | Xodimga yangi vaqtinchalik parol beradi                                                                 |
| `sudo smm-erp reset-2fa <login>`      | Telefon yo'qolganda 2FA'ni o'chiradi                                                                    |
| `sudo smm-erp unlock <login>`         | Noto'g'ri urinishlar sababli qo'yilgan blokni olib tashlaydi                                            |
| `sudo smm-erp https`                  | HTTPS sertifikatini oladi (domen keyinroq ulansa)                                                       |
| `sudo smm-erp logs`                   | Oxirgi xabarlar                                                                                         |

## Xavfsizlik

- **Parollar:** scrypt bilan shifrlangan. 5 marta xato kiritilsa, login bloklanadi. Bitta IP'dan juda ko'p urinish bo'lsa, u ham cheklanadi.
- **2FA:** admin, rahbar va moliyachi uchun majburiy (Google Authenticator).
- **Ma'lumot taqsimoti:** har bir xodim serverdan faqat o'ziga ruxsat berilgan ma'lumotni oladi. Tokenlar brauzerga hech qachon chiqmaydi.
- **Tekshiruv:** har bir amal serverda huquq va ma'lumot shakli bo'yicha tekshiriladi.
- **Jurnal:** kirishlar, xato urinishlar va rad etilgan amallar o'zgartirib bo'lmaydigan audit jurnaliga yoziladi. Uni Admin sahifasidagi "Xavfsizlik jurnali"dan ko'rish mumkin.
- **Yangi qurilma:** begona qurilmadan kirilsa, xodimning Telegramiga ogohlantirish keladi.
- **Brauzer himoyasi:** HTTPS, HSTS, qat'iy CSP, sessiya cookie'si (httpOnly, Secure, SameSite=Strict) va boshqa saytdan yuborilgan so'rovni rad etish.
