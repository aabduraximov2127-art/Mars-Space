# EduCentr — o'quv markazini boshqarish tizimi

O'quv markazlari uchun to'liq tizim: filiallar, kurslar, guruhlar, dars jadvali, davomat, vazifalar va baholar,
to'lovlar va qarzdorlik, e'lonlar, chat, coinlar, hisobotlar. To'rtta rol bor: **Superadmin**, **Admin** (o'z
filiali), **Ustoz** (o'z guruhlari) va **Student** (faqat o'zi).

| Qism | Texnologiya |
|---|---|
| Backend | Python 3.12, Django 5.2, DRF, PostgreSQL, JWT (simplejwt, refresh — HttpOnly cookie), drf-spectacular |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Hook Form + Zod, Recharts |
| Deploy | Docker Compose: PostgreSQL, Redis, gunicorn, Nginx |

Hujjatlar: [`docs/`](docs) — arxitektura, DB sxema, API kontrakti, dizayn tizimi va reja.

## Lokal ishga tushirish (Windows, Docker'siz)

Talablar: Python 3.12, Node.js 22+ va o'rnatilgan PostgreSQL (`pg_ctl` va `initdb` uchun).

```powershell
# 1. Loyihaga tegishli PostgreSQL klasteri (5433-port, ma'lumotlar .devdb\ ichida)
.\scripts\devdb.ps1 init      # bir marta: baza, foydalanuvchi va backend\.env yaratiladi
.\scripts\devdb.ps1 start     # har kompyuter qayta yoqilganda

# 2. Backend
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed_demo      # demo ma'lumotlar (faqat DEBUG=True)
.venv\Scripts\python manage.py runserver 127.0.0.1:8000

# 3. Frontend (yangi terminalda)
cd frontend
npm ci
npm run dev
```

Sayt: **http://127.0.0.1:5173**. Vite `/api` so'rovlarini Django'ga (8000-port) yo'naltiradi.
API hujjati: http://127.0.0.1:8000/api/docs/ · Django admin: http://127.0.0.1:8000/django-admin/

### Demo akkauntlar

Hamma akkauntlar uchun parol: `Demo12345!`

| Rol | Telefon |
|---|---|
| Superadmin | `+998900000001` |
| Admin (Chilonzor / Yunusobod) | `+998900000002` / `+998900000003` |
| Ustoz | `+998901000001` … `+998901000004` |
| Student | `+998902000001` … `+998902000024` |

## Tekshiruvlar

```powershell
cd backend
.venv\Scripts\python -m pytest            # 92 ta test, shu jumladan 12 ta majburiy ssenariy
.venv\Scripts\ruff check .
.venv\Scripts\python manage.py spectacular --validate --fail-on-warn --file NUL

cd ..\frontend
npm run typecheck
npm run lint
npm run build
```

## Production (Docker Compose)

```bash
cp .env.example .env          # SECRET_KEY, POSTGRES_PASSWORD, ALLOWED_HOSTS va boshqalarni to'ldiring
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser
```

Nginx frontendni beradi va `/api/`, `/django-admin/` so'rovlarini backendga yo'naltiradi. HTTPS uchun
`deploy/nginx/https.conf.example` faylidan foydalaning. Zaxira nusxa olish va tiklash skriptlari:
`scripts/backup.sh`, `scripts/restore.sh` (Windows'da: `scripts/backup-local.ps1`).

> Docker ishlab chiqish kompyuterida o'rnatilmagani uchun compose stack shu yerda sinab ko'rilmagan.

## Loyiha tuzilmasi

```
backend/    Django loyihasi: har bir modul alohida app (accounts, groups, payments, ...)
            selectors.py — rolga qarab ko'rinish doirasi, services.py — biznes qoidalari, views.py — API
frontend/   React SPA: src/lib (API klient, auth), src/components/ui (dizayn tizimi), src/features/* (sahifalar)
docs/       Arxitektura, DB sxema, API, dizayn, reja
deploy/     Nginx va frontend Dockerfile
scripts/    Lokal PostgreSQL, zaxira nusxa olish va tiklash
```
