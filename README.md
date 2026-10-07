# SMM agentlik ERP — MVP demo

Mijozga ko'rsatish uchun interaktiv demo: lid kelganidan oylik hisobot va to'lovgacha bo'lgan
butun jarayon bitta tizimda. Server kerak emas — natija bitta `index.html` fayl, ma'lumotlar
brauzerda (localStorage) saqlanadi va namunaviy ma'lumotlar bilan to'ldirilgan.

## Nimalar bor

| Modul | Imkoniyatlar |
|---|---|
| **Nazorat paneli** | Bugun joylanadigan postlar, muddati o'tganlar (qizil), tasdiq kutayotganlar, reja bajarilishi («14 ta rejadan 6 tasi joylandi»), xodimlar yuklamasi (rol bo'yicha filtr), ogohlantirishlar, qarzdorlar |
| **CRM** | Kanban varonka (sudrab o'tkazish), lid kartasi va aloqa tarixi, uchrashuv belgilash (marketologga bildirishnoma), rad etishda sabab majburiy, «Shartnoma bo'ldi» → Loyiha kartasi |
| **Loyiha kartasi** | Mijoz, shartnoma, tarif, jamoa; marketolog bloklari (Brif, Strategiya, Konkurent analiz, SWOT, Auditoriya) va uzatish tugmasi; kontent reja; vazifalar; moliya; oylik hisobot; «Ishni to'xtatish» opsiyasi |
| **Kontent reja** | Oylik kalendar va ro'yxat, post statuslari, avtomatik «Kechikdi», ichki tasdiq → mijoz tasdig'i → joylandi |
| **Syomka / Montaj / Dizayn / Target** | Har rolga alohida oyna: faqat o'z vazifalari, TZ, Google Drive havolalari, deadline, qabul qilish/qaytarish; targetolog kunlik hisoboti (qo'lda yoki Meta'dan import) |
| **Moliya** | Oldindan to'lov (100%/50%, qoldiq sanasi qo'lda), hisob davrlari (birinchi reklamadan), qisman to'lov, qarz va kechikkan kunlar, montajyor oyligi avtomatik |
| **Bildirishnomalar** | Tizim ichida + Telegram bot (Admin'da token va chat ID kiritilsa, haqiqiy xabar ketadi) |
| **Admin** | Xodimlar, rollar, huquqlar matritsasi, montaj narxi, demo'ni qayta tiklash |

Dizayn — Apple «Liquid Glass» uslubida: shisha panellar, yorug'/qorong'i rejim (tizimga ergashadi),
telefonda pastki tab bar va sheet oynalar.

Chap pastdagi akkaunt menyusidagi **«Demo: kim sifatida kirish»** orqali rolni almashtirib, har bir xodim nimani
ko'rishini ko'rsatish mumkin.

## Ishga tushirish

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/index.html — bitta mustaqil fayl
```

`dist/index.html` faylini mijozga to'g'ridan-to'g'ri yuborish yoki istalgan bepul hostingga
(GitHub Pages, Vercel, Netlify) joylash mumkin. `main` branchga push qilinganda GitHub Pages
workflow saytni avtomatik yangilaydi (Settings → Pages → Source: **GitHub Actions**).

## Demo cheklovlari (haqiqiy versiyada server bilan hal qilinadi)

- Ma'lumotlar har bir brauzerda alohida saqlanadi; xodimlar orasida umumiy baza yo'q.
- Login o'rniga rol almashtirgich.
- Telegram bot tokeni brauzerda saqlanadi — faqat demo uchun.
- Meta Ads importi namunaviy raqamlar qaytaradi.
