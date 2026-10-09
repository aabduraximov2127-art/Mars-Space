# ARCHITECTURE — EduCentr

## 1. Umumiy ko'rinish

```
 Brauzer (React SPA)                         Server
 ┌──────────────────────┐   HTTPS   ┌───────────────────────────────────────────────┐
 │ React 19 + Router 7  │──────────▶│ Nginx: /  → frontend dist (static)            │
 │ TanStack Query       │           │        /api, /django-admin → gunicorn:8000    │
 │ access token: RAM    │           │        /media/avatars → volume                │
 │ refresh: HttpOnly    │           ├───────────────────────────────────────────────┤
 │   cookie (Strict)    │           │ Django 5.2 + DRF  (stateless JWT)             │
 └──────────────────────┘           │  views → serializers → services → models      │
                                    ├───────────────────────────────────────────────┤
                                    │ PostgreSQL 18      private media (volume)     │
                                    │ (Redis — ixtiyoriy: cache/throttle)           │
                                    └───────────────────────────────────────────────┘
```
Dev'da Vite (`:5173`) `/api` va `/media` ni Django (`:8000`) ga proxy qiladi → brauzer uchun
bitta origin (cookie va CORS soddalashadi). Prod'da xuddi shu topologiyani Nginx beradi.

## 2. Katalog tuzilmasi

```
edu centr/
├── backend/
│   ├── config/            settings (base, test), urls, wsgi/asgi
│   ├── core/              umumiy: TimeStampedModel, permissions (RBAC), scoping, pagination,
│   │                      exception handler, storage, validators, health
│   ├── accounts/          User, UserProfile, auth (JWT cookie), users API
│   ├── organizations/     Branch, Room, SystemSettings
│   ├── courses/           Course, CourseMaterial
│   ├── groups/            Group, GroupMembership (+ to'lov rejasi)
│   ├── schedules/         Lesson, konflikt tekshiruvi, dars generatsiyasi
│   ├── attendance/        AttendanceRecord, AttendanceChange, foiz formulasi
│   ├── assignments/       Assignment, AssignmentSubmission, SubmissionRevision
│   ├── grades/            Grade, GradeChange
│   ├── payments/          Invoice, Payment, balans servislari
│   ├── notifications/     Notification + notify() servisi
│   ├── announcements/     Announcement
│   ├── chat/              ChatRoom, ChatMembership, ChatMessage
│   ├── rewards/           RewardTransaction
│   ├── reports/           dashboard / hisobot agregatsiyalari (modelsiz)
│   ├── audit/             AuditLog + record() servisi
│   └── tests/             cross-module ssenariy testlari
├── frontend/
│   └── src/
│       ├── app/           router, providers, layout, rolga xos navigatsiya
│       ├── components/ui/ dizayn tizimi komponentlari
│       ├── lib/           api klient, auth store, formatlash, utils
│       ├── features/<modul>/  sahifalar, api hook'lar, formalar, testlar
│       └── styles/        Tailwind 4 @theme tokenlari
├── docs/                  ushbu hujjatlar
├── scripts/               devdb.ps1, backup/restore
├── docker-compose.yml, .env.example, README.md
```

## 3. Backend qatlamlari

| Qatlam | Mas'uliyat |
|---|---|
| `models.py` | Maydonlar, DB constraintlar, oddiy computed property'lar |
| `selectors.py` | Rol/filial bo'yicha **scope qilingan querysetlar** (`groups_for(user)`, `lessons_for(user)` …) — barcha o'qish shu yerdan |
| `services.py` | Biznes operatsiyalari `transaction.atomic` ichida: yozish, holat o'tishlari, audit, bildirishnoma |
| `serializers.py` | Kirish validatsiyasi (aniq `fields`, `read_only_fields` — mass assignment himoyasi), chiqish formati |
| `views.py` | Yupqa: ruxsat → serializer → service. `role_permissions` xaritasi har action uchun |
| `permissions.py` | Obyekt darajasidagi qoidalar (o'qish ≠ yozish bo'lganda) |
| `filters.py` | django-filter FilterSet'lar |

## 4. Autentifikatsiya oqimi

1. `POST /api/auth/login/` → `{access}` (JSON) + `ec_refresh` (HttpOnly, SameSite=Strict, Path=/api/auth/).
2. Frontend access tokenni **faqat xotirada** saqlaydi (localStorage ishlatilmaydi → XSS bilan o'g'irlanmaydi).
3. Sahifa yangilanganda / `401` olinganda: `POST /api/auth/refresh/` (cookie + `X-Requested-With`) →
   yangi access; bir vaqtdagi bir nechta `401` uchun **bitta** refresh so'rovi (promise dedup).
4. Refresh rotatsiyasi + blacklist: eski refresh qayta ishlatilsa rad etiladi.
5. Logout / parol o'zgarishi / bloklash → foydalanuvchining barcha outstanding refresh tokenlari blacklist.
6. Login himoyasi: IP bo'yicha throttle (10/daq) + telefon/email bo'yicha 5 xato → 15 daq blok (cache).
   Xato urinishlar `login_failed` sifatida auditga yoziladi (parolsiz).

## 5. RBAC dizayni

* `core/permissions.py`: `RolePermission` — ViewSet'da `role_permissions = {"list": ALL, "create": (SA, AD), ...}`.
  Ro'yxatda yo'q action → **403** (default deny). `IsAuthenticated` global default.
* **Scope (o'qish)** — selectors: SA hammasi; AD `branch = user.branch`; TE o'z guruhlari
  (`group.teacher = user` yoki `lesson.teacher = user`); ST o'z yozuvlari / faol a'zo guruhlari.
  Scope'dan tashqaridagi obyekt → `404`.
* **Yozish** — service va permission'larda alohida tekshiriladi (masalan TE darsni ko'radi, lekin faqat `topic/notes` ni o'zgartiradi).
* **Majburiy qiymatlar**: AD yaratgan obyektning `branch` i doim `request.user.branch`; ST topshirig'ining
  `student` i doim `request.user`; `marked_by/graded_by/received_by/created_by` — doim `request.user`.
* Permission matritsasi testlari: har modul uchun 4 rol × asosiy harakatlar (ruxsat/rad).
* Barcha API view'lar ro'yxatini aylanib, har birida aniq ruxsat sozlanganini tekshiruvchi audit testi.

| Resurs | SA | AD | TE | ST |
|---|---|---|---|---|
| Filiallar, global sozlamalar, rollar | CRUD | o'qish (o'zi) | — | — |
| Admin akkauntlari | CRUD | — | — | — |
| Teacher/Student akkauntlari | CRUD | CRUD (filial) | o'qish (o'z studentlari) | — (faqat `me`) |
| Kurslar | CRUD | global o'qish + filial CRUD | o'qish (o'zi) | o'qish (o'zi) |
| Guruhlar, a'zolik, jadval | CRUD | CRUD (filial) | o'qish; dars mavzusi | o'qish (o'zi) |
| Davomat | yozish | yozish (filial) | yozish (o'z darsi, muddat ichida) | o'qish (o'zi) |
| Vazifalar | CRUD | CRUD (filial) | CRUD (o'z guruhi) | o'qish + topshirish |
| Baholar | o'qish | o'qish (filial) | yozish (o'z guruhi) | o'qish (o'zi) |
| To'lovlar | yozish, void | yozish, void (muddat ichida) | — | o'qish (o'zi) |
| E'lonlar | CRUD | CRUD (filial) | o'qish | o'qish |
| Audit log | o'qish | so'nggi faoliyat (dashboard) | — | — |

## 6. Fayllar
* Public: `MEDIA_ROOT/avatars/` → `/media/avatars/…` (Nginx/Django dev).
* Private: `PRIVATE_MEDIA_ROOT` (web orqali ochiq emas). Yuklab olish faqat DRF view orqali, ruxsat
  tekshirilgach `FileResponse(as_attachment=True)`. Nom `uuid4` bilan, kengaytma whitelist,
  hajm `max_upload_mb`, rasm uchun Pillow tekshiruvi. `X-Content-Type-Options: nosniff`.

## 7. Vaqt va pul
* Vaqt: §0 `DATABASE_SCHEMA.md`. Frontend datetime'larni ISO (offset bilan) yuboradi, `Asia/Tashkent` da ko'rsatadi.
* Pul: barcha hisob-kitob backendda `Decimal`. Frontend pulni faqat **formatlaydi**, arifmetika qilmaydi.

## 8. Bildirishnomalar, chat, real-time
* `notifications.services.notify(users, type, title, body, link, data)` — `bulk_create`; boshqa modullar shu orqali chaqiradi.
* Frontend: `unread-count` har 30 s polling; chat ochiq xonada har 5 s `after_id` polling.
* Django Channels + Redis — Redis mavjud bo'lganda keyingi bosqich (API kontrakti o'zgarmaydi).

## 9. Dashboard KPI formulalari (`reports/services.py` — yagona manba)

Filterlar: `date_from..date_to` (default: joriy oy), `branch` (SA), `course`, `group`, `status`.
Admin uchun `branch` doim o'z filiali.

| KPI | Formula |
|---|---|
| Studentlar soni | `COUNT(DISTINCT user)` — `role=student, is_active` va (filter bo'lsa) shu filial/kurs/guruhda `active|frozen` a'zoligi bor |
| Ustozlar soni | `COUNT(user)` — `role=teacher, is_active`, filial bo'yicha |
| Faol guruhlar | `COUNT(group)` — `status=active` |
| Kurslar soni | `COUNT(course)` — `is_active`, global + filial |
| Bugungi darslar | `COUNT(lesson)` — `date=localdate()`, `status≠cancelled` |
| Bugungi davomat | Bugungi darslar yozuvlari bo'yicha §6 formulasi (`attendance` foizi) + belgilangan/jami dars |
| To'lovlar yig'indisi | `SUM(payment.amount)` — `status=completed`, `paid_at` oraliqda (har to'lov bir marta: `id` bo'yicha) |
| Qarzdorlik | `Σ_m max(0, charged(m) − paid(m))` — a'zoliklar bo'yicha, davrga bog'liq emas (joriy holat) |
| Qarzdorlar soni | `COUNT(DISTINCT student)` debt > 0 |
| So'nggi faoliyat | `AuditLog` oxirgi 10 ta (filial bo'yicha) |
| Grafiklar | Tushum kunlar/oylar kesimida; yangi a'zoliklar oylar kesimida; davomat foizi haftalar kesimida |

Ma'lumot yo'q → `0` / `null` va frontendda "Ma'lumot yo'q" holati.

## 10. Kesuvchi talablar
* **Audit**: `audit.services.record(actor, action, obj, changes, request)` — servislardan chaqiriladi.
* **Xato formati**: `core.exceptions.api_exception_handler` (`detail`, `code`, `errors`).
* **Logging**: konsol, parol/token/so'rov tanasi loglanmaydi.
* **Throttling**: DRF scoped throttles; cache `REDIS_URL` bo'lsa Redis, aks holda LocMem.
* **Seed**: `python manage.py seed_demo` — idempotent (`get_or_create`), faqat `DEBUG=True` da (yoki `--force`).

## 11. Frontend arxitekturasi
* Router: `/login`, `/forgot-password`, `/reset-password`; rol bo'yicha daraxtlar `/superadmin/*`, `/admin/*`,
  `/teacher/*`, `/student/*` — har biri o'z layout'i (sidebar navigatsiyasi) bilan. `/` → rolga mos dashboard.
* Guard'lar: `RequireAuth` (sessiyani refresh orqali tiklaydi), `RequireRole` (boshqa rol → "Ruxsat yo'q" sahifasi).
  Backend baribir har so'rovni tekshiradi.
* Server holati — TanStack Query (query key'lar modul bo'yicha), formalar — RHF + Zod; backend `errors` → forma maydonlari.
* Har sahifada: loading skeleton, empty state, error state (qayta urinish), 403/404/network holatlari, toast feedback.
* Django admin `/django-admin/` da (SPA `/admin/*` yo'llari bilan to'qnashmasligi uchun).
