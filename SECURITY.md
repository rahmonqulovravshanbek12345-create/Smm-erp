# Xavfsizlik

Bu hujjat production'ga chiqishdan oldingi xavfsizlik auditi natijasini qayd etadi: nima tekshirildi, nima tuzatildi va nima ma'lum xavf sifatida qoldi. Serverni sozlash va topshirish tartibi [DEPLOY.md](DEPLOY.md) da.

- Audit sanasi: 2026-yil 12-oktabr
- Tekshirilgan versiya: `main` (Fastify 5 + PostgreSQL 16 + React 18, Node.js 22)
- Natija: Critical — 0, High — 1, Medium — 6, Low — 12. Tuzatilmagan Critical va High qolmadi.

## Himoya qanday qurilgan

| Qatlam          | Himoya                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kirish          | Login va parol (scrypt, N=2^16) + 2FA (TOTP) barcha xodimlarga majburiy. Birinchi kirishda parol almashtiriladi. Standart yoki namunaviy parol yo'q                                                      |
| Parol tanlash   | Login va IP bo'yicha blok (5 ta xatodan keyin 15 daqiqa, keyin uzayadi), login bo'yicha umumiy cheklov, 2FA kodlariga alohida cheklov, nginx va ilova darajasida so'rov cheklovi, fail2ban               |
| Sessiya         | 256 bitli tasodifiy token (bazada faqat SHA-256 xeshi). Cookie: `__Host-`, HttpOnly, Secure, SameSite=Strict. Admin, rahbar va moliya uchun 7 kun (1 kun harakatsizlik), qolganlar uchun 30 kun (14 kun) |
| Huquqlar        | Har bir amal serverda rol va egalik bo'yicha tekshiriladi (`src/lib/action-rules.ts`). Har bir xodimga faqat o'ziga ruxsat etilgan ma'lumot yuboriladi (`src/lib/redact.ts`)                             |
| Kiritish        | Har bir amalning argumentlari qat'iy zod sxemasi bilan tekshiriladi: noma'lum maydon, katta matn yoki noto'g'ri sana qabul qilinmaydi                                                                    |
| Brauzer         | CSP (faqat xeshli skript, tashqi manba yo'q), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, CSRF himoyasi (maxsus sarlavha + Origin tekshiruvi), CORS yopiq                                      |
| Maxfiy kalitlar | Telegram va Meta tokenlari brauzerga chiqmaydi, bazada va zaxirada AES-256-GCM bilan shifrlangan. `SECRET_KEY` har bir o'rnatishda alohida yaratiladi                                                    |
| Server          | Ilova alohida `smmerp` foydalanuvchisi nomidan, systemd sandbox ichida ishlaydi. Baza faqat ichkaridan ochiq, parolsiz. Devor: faqat SSH, HTTP va HTTPS                                                  |
| Jurnal          | Kirishlar, xato urinishlar va barcha amallar audit jurnaliga yoziladi. Jurnalni o'zgartirib, o'chirib yoki TRUNCATE qilib bo'lmaydi, 2 yil saqlanadi                                                     |
| Yangilanish     | Node.js xavfsizlik yangilanishlari har kuni avtomatik o'rnatiladi (rasmiy imzo tekshiriladi, ishlamasa orqaga qaytadi). Ilova faqat aniq versiya va xesh bilan yangilanadi                               |
| Zaxira          | Har kecha mahalliy nusxa (30 kun) + shifrlangan off-site nusxa (90 kun). Ochish kaliti faqat egasida                                                                                                     |

## Topilmalar va holati

Har bir High va Medium topilma uchun hujumni takrorlaydigan avtomatik test bor. Test tuzatishdan oldin yiqilishi, keyin o'tishi tekshirildi. Testlar: `server/test/security.test.ts` va `server/test/quota.test.ts`.

### High

| #   | Topilma                                                                                           | Holat     | Tuzatish va dalil                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Node.js 22.22.0 o'rnatilardi. Undan keyin 3 ta xavfsizlik relizi chiqqan, ichida High CVE'lar bor | Tuzatildi | 22.23.3 ga o'tildi. `deploy/node-update.sh` har kuni yangi 22.x versiyani tekshiradi va rasmiy imzo bilan o'rnatadi. `scripts/check-node.mjs` CI'da eski versiyani ushlaydi: 22.22.0 da xato, 22.23.3 da o'tadi. Docker'da sinaldi: yangilash, soxta imzoni rad etish, orqaga qaytish |

### Medium

| #   | Topilma                                                                                                                    | Holat     | Tuzatish va dalil                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Operator boshqa operatorning lidini o'ziga o'tkazib, o'sha mijozning loyihasi, fakturalari va to'lovlarini ko'rardi (IDOR) | Tuzatildi | Lid egasini faqat admin, rahbar yoki marketolog almashtiradi. Test: oldin 200 qaytardi, endi 403 va loyiha ko'rinmaydi                                        |
| M2  | Bitta xodim katta matnlar bilan bazani to'ldirib, tizimni hamma uchun ishlamaydigan qila olardi (DoS)                      | Tuzatildi | Har bir xodimga kunlik 5 MB kvota (admin cheklanmaydi). Hajm 50 MB dan oshsa, adminga ogohlantirish. Test: oldin 30/30 so'rov o'tdi, endi kvota tugagach 429  |
| M3  | `smm-erp update` GitHub'dagi «eng oxirgi» relizni root huquqi bilan tekshiruvsiz o'rnatardi                                | Tuzatildi | Endi `update <versiya> <sha256>` shaklida ishlaydi. Docker'da sinaldi: xeshsiz, noto'g'ri xesh bilan va mavjud bo'lmagan versiya bilan rad etadi              |
| M4  | Telegram va Meta tokenlari bazada va zaxirada ochiq matn edi                                                               | Tuzatildi | `SECRET_KEY` bilan shifrlanadi. Test: bazadagi JSON'da token yo'q, qayta ishga tushganda tiklanadi, boshqa kalit bilan ochilmaydi                             |
| M5  | Zaxira faqat shu serverda va shifrlanmagan edi                                                                             | Tuzatildi | `smm-erp offsite-setup`: age bilan shifrlanib bulutga yuboriladi. Docker'da sinaldi: begona kalit bilan ochilmaydi, egasi baza va `SECRET_KEY` ni tiklaydi    |
| M6  | SSH'ga parol bilan kirish o'chirilmagan edi                                                                                | Tuzatildi | `smm-erp harden-ssh`: kalit bo'lmasa rad etadi, bo'lsa parol bilan kirishni o'chiradi. Docker'da sinaldi. **Serverda bajarilishi kerak** (DEPLOY.md, 6-qadam) |

### Low

| #   | Topilma                                                                                                        | Holat                  | Izoh                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| L1  | 2FA faqat 4 ta rol uchun majburiy edi                                                                          | Tuzatildi              | `REQUIRE_2FA_ROLES=all` (standart)                                                                              |
| L2  | scrypt N=2^15, OWASP tavsiyasidan past                                                                         | Tuzatildi              | N=2^16. Eski xeshlar muvaffaqiyatli kirishda avtomatik yangilanadi                                              |
| L3  | Chiqishda `__Host-` cookie brauzerda qolardi                                                                   | Tuzatildi              | Cookie Secure belgisi bilan o'chiriladi                                                                         |
| L4  | Parol almashtirish va 2FA'ni o'chirishda blok tekshirilmasdi                                                   | Tuzatildi              | Kirishdagi blok bu yerda ham amal qiladi                                                                        |
| L5  | Loginni bilgan odam ko'p IP'dan xodimni vaqtincha bloklay oladi                                                | Qisman (qabul qilindi) | fail2ban 10 daqiqada 20 xato urinishda IP'ni 1 soatga bloklaydi. Blokni `smm-erp unlock <login>` olib tashlaydi |
| L6  | Audit jurnalini TRUNCATE qilish mumkin edi, saqlash muddati yo'q edi, adashib yozilgan parol jurnalga tushardi | Tuzatildi              | TRUNCATE taqiqlangan, 2 yil saqlanadi, mavjud bo'lmagan login yozilmaydi                                        |
| L7  | Moliya xodimi o'ziga oylik belgilashi va o'zini to'lashi mumkin edi                                            | Tuzatildi              | Bularni endi faqat rahbar yoki admin qiladi                                                                     |
| L8  | Tashqi so'rovlarda vaqt chegarasi yo'q edi                                                                     | Tuzatildi              | 20 soniya                                                                                                       |
| L9  | npm'da 8 ta zaiflik bor, faqat yig'ish vositalarida (tailwind zanjiri)                                         | Qabul qilindi          | Productionga kirmaydi (prod: 0 ta). `braces` ning tuzatilgan versiyasi umuman chiqmagan                         |
| L10 | Google Fonts orqali xodimlarning IP manzili Google'ga ketardi                                                  | Tuzatildi              | Shrift ilovaning ichida, CSP'dan tashqi manbalar olib tashlandi                                                 |
| L11 | Meta kabinetini mavjud bo'lmagan loyihaga ham ulash mumkin edi                                                 | Tuzatildi              | Loyiha borligi tekshiriladi                                                                                     |
| L12 | Rahbariyat sessiyasi 30 kun edi                                                                                | Tuzatildi              | 7 kun, 1 kun harakatsizlikda tugaydi                                                                            |

Audit davomida xavfsizlikka aloqasi yo'q bitta xato ham topildi: telefon ekrani belgisi (`fd-touch-icon.png`) reliz paketiga kirmagan edi. Tuzatildi, endi fayl yetishmasa paket yig'ilmaydi.

## Tuzatishlarning mustaqil tekshiruvi

Barcha tuzatishlar alohida tekshiruvchiga qayta ko'rib chiqtirildi. U 15 ta kamchilik topdi: 1 High, 3 Medium, 11 Low. Auth chetlab o'tish, token sizib chiqishi yoki migratsiya xatosi topilmadi. Hammasi tuzatildi:

- **High:** interaktiv `offsite-setup` ishlamas edi (age-keygen mavjud faylga yozmaydi).
- **Medium:**
  - bulutga yuborish xatosi favqulodda tiklash va yangilashni to'xtatardi — endi ular uchun faqat mahalliy nusxa olinadi;
  - noto'g'ri `SECRET_KEY` tokenlarni abadiy o'chirardi — endi ochilmagan token o'zgarmasdan saqlanadi va to'g'ri kalit qaytsa tiklanadi;
  - eski o'rnatishlar yangi himoyalarni olmasdi — DEPLOY.md'ga yangilash tartibi qo'shildi.
- **Low:**
  - moliya xodimiga doim rad etiladigan «To'lash» tugmasi ko'rinardi;
  - moliya xodimi o'ziga qilingan to'lov yozuvini o'chira olardi;
  - fail2ban 429 javoblarini ham sanab, butun ofis IP'sini bloklab qo'yishi mumkin edi;
  - harden-ssh `MaxAuthTries` ni kamaytirardi va qattiqroq `PermitRootLogin no` sozlamasini bo'shatishi mumkin edi;
  - Node yangilagichi ishlamagan versiyani har kuni qayta urinardi;
  - tiklash va yangilash bir vaqtda ishlashi mumkin edi;
  - ilova yangilanishi orqaga qaytganda yangi fayllar qolib ketardi;
  - kvota hisobi qayta ishga tushgandan keyin noto'g'ri boshlanardi va kvota tugagach bildirishnomalarni o'qish ham bloklanardi;
  - eski sessiyalarga yangi muddat qo'llanmasdi;
  - eski Safari'da vaqt chegarasi xato berardi;
  - DEPLOY.md'dagi tiklash qadamida `mkdir` yetishmasdi.

CI'da ham bitta xato topildi: token kiritilib, darhol «Ulanishni tekshirish» bosilsa, tekshiruv tokenni saqlash so'rovidan o'zib ketardi. Tuzatildi, sekin tarmoqni taqlid qiluvchi doimiy test qo'shildi. Test tuzatishsiz yiqiladi.

## Tekshirilgan va muammo topilmagan

- **Injection:** barcha SQL so'rovlar parametrli. Serverda buyruq ishga tushirish (`child_process`) yo'q. Fayl yo'llari foydalanuvchidan olinmaydi.
- **SSRF:** tashqi so'rovlar faqat 3 ta qat'iy manzilga ketadi (graph.facebook.com, api.telegram.org, cbu.uz). Kabinet ID, API versiyasi va token regex bilan tekshiriladi.
- **XSS:** React matnni o'zi ekranlaydi, `dangerouslySetInnerHTML` yo'q. Foydalanuvchi kiritgan havolalar faqat http(s) bo'lib ochiladi. Excel eksportida formula ishga tushmaydi.
- **Fayl yuklash:** yo'q, fayllar Google Drive havolasi sifatida saqlanadi. Shu sababli yuklash orqali hujum yo'li ham yo'q.
- **Sirlar:** gitleaks 8.28 bilan butun git tarixi (47 ta commit) va fayllar tekshirildi. Faqat testlardagi soxta parol topildi. `.env` ishlatilmaydi, sirlar `/etc/smm-erp/env` faylida (640, root:smmerp).
- **Production paketi:** test endpointlari (`/__test`) va source map kirmagan. Xato xabarlarida stack trace yoki SQL ko'rsatilmaydi.
- **Bog'liqliklar:** `npm audit`: server va brauzer runtime'ida 0 ta zaiflik (2026-10-12 holatiga).

## Ma'lum xavflar (qolgan)

Quyidagilar kod bilan to'liq hal qilinmaydi. Mijozga topshirishda tushuntirilishi kerak.

1. **Node.js 22 ning muddati 2027-yil aprelda tugaydi.** Avtomatik yangilagich faqat 22.x ichida ishlaydi. Shu sanadan keyin xavfsizlik tuzatishlari chiqmaydi, Node 24 ga o'tish uchun dasturchi kerak bo'ladi.
2. **Ilova kutubxonalari (Fastify va boshqalar) o'zi yangilanmaydi.** Ular faqat yangi reliz bilan yangilanadi, loyiha esa qo'llab-quvvatlanmaydi. Audit sanasida zaiflik yo'q edi. Vaqt o'tishi bilan yangi CVE'lar chiqishi mumkin, shuning uchun yiliga bir marta dasturchiga tekshirtirish tavsiya etiladi.
3. **Yangilanish manbasi.** Relizlar sotuvchining GitHub akkauntida turadi. Akkaunt buzilsa va admin o'sha sahifadagi xesh bilan yangilasa, begona kod o'rnatilishi mumkin. Xeshni boshqa kanal orqali tasdiqlating, GitHub akkauntida 2FA yoqing yoki repozitoriyni agentlikning o'z akkauntiga ko'chiring.
4. **Ichki xodim.** Admin huquqi to'liq. Amallar audit jurnalida qoladi, lekin admin parolini faqat ishonchli odam bilishi kerak.
5. **Baza ichidagi ma'lumot shifrlanmagan.** Telefonlar, oyliklar va rekvizitlar bazada ochiq turadi. Ularni server kirish huquqlari, faqat root o'qiy oladigan zaxira va shifrlangan off-site nusxa himoya qiladi. Hosting disk shifrlashni taklif qilsa, uni yoqing.
6. **Telegram xabarlari.** Bildirishnomalarda mijoz nomi kabi ish ma'lumotlari Telegram serverlari orqali o'tadi.
7. **DDoS.** Faqat so'rov cheklovlari bor. Kuchli hujum bo'lsa, Cloudflare kabi himoya xizmati kerak bo'ladi.
8. **Ma'lumot hajmi.** Butun ma'lumot bitta hujjatda saqlanadi. Taxminan 100 MB dan keyin tizim sekinlashadi (50 MB da adminga ogohlantirish keladi). Eski bildirishnoma va tarix avtomatik qisqartiriladi.
9. **CSP'da `style-src 'unsafe-inline'`.** Bitta faylli yig'ish uchun kerak. Skriptlar baribir faqat xesh bilan ishlaydi, shuning uchun xavfi past.
10. **Bulutdagi zaxira.** Server buzilsa, bulut kaliti bilan nusxalarni o'chirish mumkin. Bucket'da Object Lock (90 kun) yoqing (DEPLOY.md, 7-qadam).
11. **Kvota xotirada hisoblanadi.** Server qayta ishga tushganda kunlik hisoblagich nolga tushadi. Bu ataylab shunday: admin `sudo smm-erp restart` bilan xodimni blokdan chiqara oladi.

## Tekshiruvni takrorlash

```bash
npm run check                       # tiplar, lint, format, 192 unit test
npx vitest run -c server/vitest.config.ts   # 57 server testi (hujum testlari ham), TEST_DATABASE_URL kerak
npm run e2e && npm run e2e:server   # brauzer testlari: demo va serverli versiya
node scripts/check-node.mjs         # Node.js versiyasi xavfsizlik relizlaridan orqada emasmi
npm audit --omit=dev                # runtime bog'liqliklari
```

Tekshirilmagan: haqiqiy Eskiz serverining holati (SSH, ochiq portlar, DNS, sertifikat). Ular [DEPLOY.md](DEPLOY.md) dagi checklist bilan tekshiriladi. DDoS chidamliligi ham, Meta token ruxsatlari ham tekshirilmagan.
