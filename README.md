# SMM agentlik ERP — MVP demo

Mijozga ko'rsatish uchun interaktiv demo: lid kelganidan oylik hisobot va to'lovgacha bo'lgan
butun jarayon bitta tizimda. Server kerak emas — natija bitta `index.html` fayl, ma'lumotlar
brauzerda (localStorage) saqlanadi va namunaviy ma'lumotlar bilan to'ldirilgan.

## Nimalar bor

| Modul                                 | Imkoniyatlar                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nazorat paneli**                    | Bugun joylanadigan postlar, muddati o'tganlar (qizil), tasdiq kutayotganlar, reja bajarilishi («14 ta rejadan 6 tasi joylandi»), xodimlar yuklamasi (rol bo'yicha filtr), ogohlantirishlar, qarzdorlar                                                                                                                               |
| **CRM**                               | Kanban varonka (sudrab o'tkazish), lid kartasi va aloqa tarixi, uchrashuv belgilash (marketologga bildirishnoma), rad etishda sabab majburiy, «Shartnoma bo'ldi» → Loyiha kartasi                                                                                                                                                    |
| **Loyiha kartasi**                    | Mijoz, shartnoma, tarif, jamoa; marketolog bloklari (Brif, Strategiya, Konkurent analiz, SWOT, Auditoriya) va uzatish tugmasi; kontent reja; vazifalar; moliya; oylik hisobot; «Ishni to'xtatish» opsiyasi                                                                                                                           |
| **Kontent reja**                      | Oylik kalendar va ro'yxat, post statuslari, avtomatik «Kechikdi», ichki tasdiq → mijoz tasdig'i → joylandi                                                                                                                                                                                                                           |
| **Syomka / Montaj / Dizayn / Target** | Har rolga alohida oyna: faqat o'z vazifalari, TZ, Google Drive havolalari, deadline, qabul qilish/qaytarish; targetolog kunlik hisoboti (qo'lda yoki Meta'dan import)                                                                                                                                                                |
| **Moliya**                            | Moliyaviy panel (KPI, grafiklar, avtomatik xulosalar), kirim-chiqim jurnali (so'm + USD, o'tkazmalar), hisob-fakturalar, foyda va zarar (oyma-oy va loyihalar kesimida), pul oqimi (Cash Flow), debitorlik/kreditorlik (muddatlar bo'yicha), akt-sverka (mijoz va xodim, chop etiladi), to'lov kalendari (prognoz qoldiq), reja-fakt |
| **Ish haqi**                          | Har xodimga sxema: ishbay (montaj, dizayn, syomka), loyiha bo'yicha oylik, fiks oylik, bonus/jarima. Avtomatik hisoblash, tasdiqlash, to'lov (FIFO), vedomost, stavkalar                                                                                                                                                             |
| **Xodim kabineti**                    | «Mening kunim» — bugungi ishlar; «Mening hisobim» — nima uchun qancha hisoblandi, to'landi, qoldi                                                                                                                                                                                                                                    |
| **Jarayon**                           | «Qanday ishlaydi» sxemasi, loyiha yo'li (8 bosqich + keyingi qadam), post yo'li                                                                                                                                                                                                                                                      |
| **Bildirishnomalar**                  | Tizim ichida + Telegram bot (Admin'da token va chat ID kiritilsa, haqiqiy xabar ketadi)                                                                                                                                                                                                                                              |
| **Mijoz hisoboti**                    | Har davr uchun avtomatik oylik hisobot: postlar (o'z vaqtida/kechikkan, format va platforma kesimida), reklama sarfi, lidlar, lid narxi, qamrov, obunachilar — o'tgan davrga nisbatan o'zgarish, kunlik grafik, keyingi davr rejasi. PDF/chop etish va havola                                                                        |
| **Sotuv analitikasi**                 | Voronka (bosqichma-bosqich konversiya), manbalar va operatorlar kesimida, rad sabablari, sifatsiz lidlar, o'rtacha sotuv sikli, CAC, ARPA, LTV va LTV:CAC                                                                                                                                                                            |
| **Hujjatlar**                         | Ma'lumotlardan avtomatik to'ldiriladigan shartnoma, hisob-faktura va bajarilgan ishlar dalolatnomasi (summa so'z bilan), chop etish/PDF; rekvizitlar Admin → Sozlamalar'da                                                                                                                                                           |
| **Excel eksport**                     | CRM, sotuv analitikasi, foyda-zarar, Cash Flow, debitor-kreditor, akt-sverka, fakturalar, kirim-chiqim, ish haqi vedomosti — `.xlsx` formatida                                                                                                                                                                                       |
| **Admin**                             | Xodimlar, rollar, huquqlar matritsasi, kompaniya rekvizitlari, USD kursi, ish haqi kuni, demo'ni qayta tiklash                                                                                                                                                                                                                       |

Dizayn — Apple «Liquid Glass» uslubida: shisha panellar, yorug'/qorong'i rejim (tizimga ergashadi),
telefonda pastki tab bar va sheet oynalar.

## Hisob siyosati

- Foyda va zarar — **hisoblash usulida**: daromad xizmat davri kunlariga taqsimlanadi, ish haqi hisoblangan sanada, ta'minotchi xarajati hujjat sanasida.
- Pul oqimi — faqat haqiqiy kirim-chiqim.
- Mijozning reklama byudjeti — **tranzit** (daromad ham, xarajat ham emas).
- Aylanma soliq avtomatik hisoblanmaydi — to'langanda chiqim sifatida kiritiladi.
- Valyuta: so'm va USD (tranzaksiya kunidagi kurs).

Kod: hisob-kitob yadrosi — `src/lib/finance.ts`, namunaviy 6 oylik tarix — `src/lib/seed-finance.ts` va `src/lib/seed-history.ts`,
mijoz hisoboti — `src/lib/report.ts`, sotuv analitikasi — `src/lib/sales.ts`, Excel yozuvchi — `src/lib/xlsx.ts`.

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
