# PROJECT AUDIT — EduCentr (Phase 0)

Sana: 2026-10-07 · Muallif: AI muhandis (Claude) · Holat: boshlang'ich audit

## 1. Loyiha papkasi holati

| Tekshiruv | Natija |
|---|---|
| Papka | `C:\Users\student\Desktop\edu centr` — **yangi yaratildi**, ichida oldindan hech qanday kod yo'q edi |
| Git | Yangi repozitoriy (`git init -b main`). Oldingi commitlar, foydalanuvchi o'zgarishlari yo'q |
| Frontend / Backend | Mavjud emas — noldan yaratiladi |
| `package.json`, `requirements.txt`, `pyproject.toml` | Mavjud emas |
| Django settings / URL / modellar | Mavjud emas |
| Dizayn skrinshotlari (MARS) | **Taqdim etilmagan** — dizayn mustaqil ishlab chiqiladi (qarang: `DESIGN.md`) |

Xulosa: bu **greenfield** loyiha. Mavjud kodni saqlash yoki migratsiya qilish talab qilinmaydi.
Destructive amallar (reset, force push, DB tozalash) bajarilmagan.

## 2. Ishlab chiqish muhiti (haqiqiy tekshiruv natijalari)

| Vosita | Versiya / holat | Izoh |
|---|---|---|
| OS | Windows 11 Home 10.0.26200 | Admin huquqisiz foydalanuvchi |
| Python | 3.12.10 | `uv 0.12.5` ham mavjud |
| Node.js / npm | 24.18.0 / 11.16.0 | |
| Git | 2.55.0 | |
| PostgreSQL | 18.6 (o'rnatilgan servis, port 5432) | Paroli noma'lum — **tegilmadi** |
| Dev PostgreSQL klaster | 18.6, `127.0.0.1:5433`, loyiha ichida `.devdb/` | `scripts/devdb.ps1` orqali yaratildi (foydalanuvchi tanlovi) |
| Docker | **O'rnatilmagan** | Docker fayllari yoziladi, lekin bu kompyuterda sinab bo'lmaydi |
| Redis | **O'rnatilmagan** | Real-time chat keyingi bosqichga qoldiriladi (polling ishlatiladi) |
| Brauzerlar | Edge, Chrome | Playwright E2E uchun brauzer yuklab olish shart emas (`channel`) |

## 3. Kutubxonalar mosligi (PyPI / npm, 2026-10-07 holatiga)

### Backend
| Paket | Tanlangan | Sabab |
|---|---|---|
| Django | **5.2.x LTS** | 6.1 mavjud, lekin `djangorestframework-simplejwt 5.5.1` rasmiy ravishda faqat ≤5.2, `pytest-django`, `drf-spectacular`, `channels` ≤6.0. LTS — 2028-04 gacha xavfsizlik yangilanishlari |
| djangorestframework | 3.18.x | Django 5.2/6.0/6.1 ni qo'llaydi |
| djangorestframework-simplejwt | 5.5.x | token blacklist bilan |
| django-filter | 26.x | Django 5.2 ✓ |
| drf-spectacular | 0.30.x | OpenAPI 3 / Swagger |
| psycopg[binary] | 3.3.x | PostgreSQL drayveri |
| django-cors-headers, whitenoise, Pillow, django-environ, gunicorn | so'nggi barqaror | |
| pytest, pytest-django, pytest-cov, freezegun, ruff | so'nggi barqaror | test va lint |

### Frontend
| Paket | Tanlangan | Sabab |
|---|---|---|
| React / React DOM | 19.x | |
| Vite | 8.x | `@vitejs/plugin-react 6` faqat Vite 8 ni qo'llaydi |
| TypeScript | **5.9.x** | TS 7.0 (Go port) `typescript-eslint` bilan mos emas (`<6.1.0`) |
| react-router | **7.x** | v8 juda yangi; v7 API barqaror va `version-7` tegida qo'llab-quvvatlanadi |
| Tailwind CSS | 4.x (`@tailwindcss/vite`) | CSS-first tokenlar (`@theme`) |
| TanStack Query 5, React Hook Form 7, Zod 4, @hookform/resolvers 5 | so'nggi | Zod 4 ni resolvers 5 qo'llaydi |
| axios, recharts 3, lucide-react, sonner, clsx, tailwind-merge | so'nggi | |
| vitest 5, @testing-library/*, jsdom | so'nggi | Vite 8 bilan mos |
| @playwright/test | so'nggi | O'rnatilgan Edge/Chrome bilan |

## 4. Aniqlangan xavflar va qarorlar

| # | Xavf / cheklov | Qaror |
|---|---|---|
| R1 | Docker yo'q — deployment konfiguratsiyasini lokal tekshirib bo'lmaydi | Dockerfile/compose yoziladi, README'da "sinovdan o'tmagan" deb aniq belgilanadi |
| R2 | Redis yo'q — Channels real-time chat ishlamaydi | Chat REST API + polling; real-time alohida bosqich |
| R3 | Email/SMS provayder yo'q | Parolni tiklash email orqali ishlab chiqiladi, dev'da `console` backend. SMTP sozlanmaguncha "haqiqiy yuborish tayyor" deb hisoblanmaydi |
| R4 | To'lov provayderi (Click/Payme) yo'q | Faqat **ichki** to'lov hisobi. Gateway integratsiyasi yo'q |
| R5 | MARS skrinshotlari yo'q | Mustaqil dizayn; "MARS'ning aniq nusxasi" deb da'vo qilinmaydi |
| R6 | Papka nomida bo'sh joy (`edu centr`) | Skriptlarda yo'llar qo'shtirnoqda; compose'da `name: educentr` |
| R7 | Ko'p-jarayonli serverlarda LocMem cache throttling'ni jarayon bo'yicha bo'ladi | `REDIS_URL` berilsa Redis cache ishlatiladi; hujjatlashtirilgan |
| R8 | Bir nechta filialda ishlovchi ustoz | V1 da har bir xodim bitta filialga biriktiriladi (cheklov hujjatlashtirilgan) |

## 5. Mavjud funksiyalar / tugallanmagan modullar / xatolar

Loyiha yangi bo'lgani uchun mavjud funksiya, tugallanmagan modul yoki xato yo'q.
Keyingi holat `IMPLEMENTATION_PLAN.md` dagi bosqichlar jadvalida yuritiladi.
