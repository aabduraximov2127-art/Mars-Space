# YAKUNIY HISOBOT — EduCentr

Sana: 2026-10-09 · Repo: `github.com/aabduraximov2127-art/Mars-Space` (`main`)
Bu hisobot `MASTER_TASK.md` §22 talabiga javob. Har bir "ishlaydi" degan da'vo shu sanada tekshirilgan;
tekshirilmagan narsalar alohida bo'limda ko'rsatilgan.

## 1. Funksiyalar

| Modul | Imkoniyatlar | Rollar |
|---|---|---|
| Auth | Telefon/email bilan kirish, JWT (access xotirada, refresh HttpOnly cookie, rotatsiya + blacklist), logout, parolni o'zgartirish/tiklash, 5 xato urinishdan so'ng blok, IP throttle | Hamma |
| Foydalanuvchilar | Admin/ustoz/student yaratish (vaqtinchalik parol), tahrirlash, bloklash/blokdan chiqarish, parolni tiklash, rol o'zgartirish, o'quv tarixi, ustoz yuklamasi | SA, AD (filial), TE (o'z studentlari — o'qish) |
| Filiallar, xonalar, sozlamalar | CRUD, arxivlash, global sozlamalar (davomat siyosati, fayl limitlari, to'lov muddatlari, coin limiti) | SA; AD — xonalar va o'qish |
| Kurslar | Umumiy va filial kurslari, materiallar (fayl/havola, himoyalangan yuklab olish) | SA, AD; TE/ST — o'qish |
| Guruhlar | Yaratish, ustoz/xona, dars kunlari, sig'im; a'zolik: qo'shish, chegirma, muzlatish, chiqarish, boshqa guruhga ko'chirish (tarix saqlanadi) | SA, AD |
| Dars jadvali | Haftalik ko'rinish, jadvaldan darslar generatsiyasi, guruh/ustoz/xona to'qnashuvi → 409, bekor qilish (bildirishnoma), ustoz mavzuni tahrirlaydi | SA, AD; TE — mavzu |
| Davomat | Dars bo'yicha belgilash varag'i, 4 holat, o'zgarish tarixi, ustoz uchun tahrir muddati, belgilanmagan darslar, guruh matritsasi, foiz | SA, AD, TE; ST — o'qish |
| Vazifalar | Qoralama/e'lon/yopish, fayl va havola, muddat, kechikib topshirish; student topshiradi (versiyalar), ustoz tekshiradi, qayta ishlashga qaytaradi, baholaydi | TE (o'z guruhi), SA/AD; ST — topshirish |
| Baholar | Baho + izoh, o'zgarish tarixi, jurnal (vazifa × student), o'rtacha foiz | TE yozadi; hamma o'z doirasida o'qiydi |
| To'lovlar | To'lov qabul qilish (idempotency kaliti, 2 daqiqalik takroriy to'lov ogohlantirishi), chek va chop etish, bekor qilish (sabab, admin uchun muddat), oylik hisoblar (FIFO holati), balans, qarzdorlar, eslatmalar | SA, AD; ST — o'qish |
| Bildirishnomalar | Yangi vazifa, baho, qayta ishlash, jadval o'zgarishi, to'lov, e'lon, coin; o'qilmaganlar soni (30 s polling) | Hamma |
| E'lonlar | Filial / guruh / rol bo'yicha auditoriya, qadash, amal qilish muddati | SA, AD yozadi |
| Chat | Guruh chati va ruxsat etilgan shaxsiy suhbatlar (ST↔ST taqiqlangan), o'chirish, o'qilmaganlar, 5 s polling, 30 xabar/daq cheklovi | Hamma |
| Coinlar | Berish/jarima/sarflash, ustoz limiti, manfiy balans taqiqi, reyting | SA, AD, TE beradi |
| Hisobotlar | 4 rol uchun dashboard (KPI + grafiklar), moliya (CSV eksport), davomat, o'zlashtirish | SA, AD; TE — davomat/o'zlashtirish |
| Audit log | Barcha muhim amallar, filtr, o'zgarishlar JSON | SA |

API: 132 ta endpoint (method × path), hammasi `RolePermission` bilan (default rad) — `accounts/tests/test_permission_audit.py` buni kafolatlaydi.

## 2. Arxitektura va ma'lumotlar bazasi

Batafsil: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md), [`API_SPECIFICATION.md`](API_SPECIFICATION.md), [`DESIGN.md`](DESIGN.md).

* Backend: Django 5.2 + DRF, har modul alohida app. Qatlamlar: `selectors.py` (rol/filial bo'yicha scope — begona obyekt 404),
  `services.py` (biznes qoidalari `transaction.atomic` ichida, audit, bildirishnomalar), yupqa `views.py`.
* Formulalarning yagona manbalari: davomat foizi `attendance/calculations.py`, balans/qarz `payments/calculations.py`,
  KPI'lar `reports/services.py`.
* Frontend: React 19 SPA, TanStack Query, lazy route'lar, dizayn tokenlari `src/styles/index.css`.
* DB: PostgreSQL; pul — `DecimalField`; unique/check constraintlar (bitta faol a'zolik, dars uchun bitta davomat,
  bitta topshiriq, hisob summasi izchilligi va h.k.).

## 3. Fayllar (asosiylari)

| Joy | Mazmun |
|---|---|
| `backend/<app>/{selectors,services,serializers,views,urls}.py` | Har modulning API'si (~11 000 qator Python) |
| `backend/core/management/commands/seed_demo.py` | Demo ma'lumotlar (idempotent, faqat DEBUG) |
| `backend/tests/` | 12 majburiy ssenariy va biznes qoidalari testlari |
| `frontend/src/features/*` | 41 ta sahifa/komponent fayli (~10 700 qator TypeScript) |
| `frontend/e2e/` | Playwright brauzer testlari |
| `.github/workflows/ci.yml` | CI |
| `docker-compose.yml`, `deploy/`, `scripts/` | Deploy, Nginx, backup/restore |

## 4. Test natijalari (2026-10-09)

| Tekshiruv | Natija |
|---|---|
| Backend `pytest` | **95 passed** (12 ssenariy, permission audit, biznes qoidalari, formulalar) |
| `ruff check`, `ruff format --check` | toza |
| `makemigrations --check` | o'zgarish yo'q |
| `spectacular --validate --fail-on-warn` | toza |
| Frontend `vitest` | **27 passed** (formatlash, API xatolari, modal, jadval holatlari, login validatsiyasi, rol navigatsiyasi) |
| `tsc -b`, `eslint` | toza |
| `vite build` | muvaffaqiyatli (lazy chunk'lar) |
| Playwright (lokal Chrome) | **11 passed**, ikki marta ketma-ket: 4 rolning barcha sahifalari + vazifa→topshirish→baho, davomat, to'lov, yozilish, chat |
| GitHub Actions CI | `f1580c7` commitida **success** |

## 5. Ishga tushirish va URL'lar

Buyruqlar: [`README.md`](../README.md).

| Nima | URL |
|---|---|
| Sayt (dev) | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000/api/ |
| Swagger UI | http://127.0.0.1:8000/api/docs/ (ReDoc: `/api/redoc/`, sxema: `/api/schema/`) |
| Django admin | http://127.0.0.1:8000/django-admin/ |

Demo akkauntlar: parol `Demo12345!`; superadmin `+998900000001`, admin `+998900000002`, ustoz `+998901000001`,
student `+998902000001`.

## 6. Qo'lda sozlanadigan narsalar

* `.env` (prod): `SECRET_KEY` (≥ 50 belgi), `ALLOWED_HOSTS`, `POSTGRES_PASSWORD`, `FRONTEND_URL`, `COOKIE_SECURE=true`.
* Birinchi superadmin: `python manage.py createsuperuser` (telefon raqam bilan).
* Email (parolni tiklash): `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` — sozlanmaguncha xat
  **yuborilmaydi**, faqat server logiga chiqadi.
* HTTPS: `deploy/nginx/https.conf.example` + sertifikat.
* SMS va to'lov gateway (Click/Payme) **ulanmagan**: to'lovlar faqat ichki qayd sifatida kiritiladi.

## 7. Tugallanmagan funksiyalar

* Real-time chat (Django Channels + Redis) — hozir polling; API kontrakti o'zgarmaydi.
* SMS xabarnomalar va onlayn to'lov gateway — provayder kalitlari yo'q.
* Skrinshotlar berilmagani uchun MARS dizayni bilan sahifama-sahifa taqqoslash qilinmagan (`DESIGN.md` §8).

## 8. Ma'lum muammolar

* Docker Compose stack sinalmagan (ishlab chiqish kompyuterida Docker yo'q).
* Playwright testlari ishlab turgan dev stack va demo ma'lumotlarni talab qiladi, shuning uchun CI'da ishga tushmaydi.
* Brauzerning sana maydonlari (`<input type="date">`) tizim tilida ko'rinadi (masalan, `дд.мм.гггг`).
* Login cheklovi (10/daq/IP) bir ofisdan ko'p xodim bir vaqtda kirsa sezilishi mumkin — `THROTTLE_LOGIN` env bilan sozlanadi.

## 9. Deployment — keyingi qadamlar

1. Serverga Docker o'rnatish, `.env` to'ldirish, `docker compose up -d --build`.
2. `createsuperuser`, filiallar va kurslarni kiritish (demo seed prod'da ishlatilmaydi).
3. HTTPS (Let's Encrypt) va `COOKIE_SECURE=true`.
4. `scripts/backup.sh` ni cron orqali kunlik ishga tushirish va tiklashni bir marta sinash.
5. SMTP sozlash; kerak bo'lsa Redis + Channels bilan real-time chat.
