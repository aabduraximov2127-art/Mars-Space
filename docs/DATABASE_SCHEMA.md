# DATABASE SCHEMA — EduCentr

PostgreSQL 18 · Django 5.2 ORM · Barcha jadvallarda `id BIGINT` (BigAutoField) primary key.

## 0. Umumiy siyosatlar

| Mavzu | Qoida |
|---|---|
| Vaqt zonasi | `USE_TZ=True`, `TIME_ZONE="Asia/Tashkent"`. `DateTimeField` lar bazada UTC'da saqlanadi. Dars sanasi/vaqti (`DateField` + `TimeField`) — filialning mahalliy (Toshkent) devor-soati vaqti. "Bugun" = `timezone.localdate()` |
| Pul | `DecimalField(max_digits=12, decimal_places=2)`. API'da string (`"1250000.00"`). Float ishlatilmaydi. Yaxlitlash: `ROUND_HALF_UP` 2 xonagacha |
| `created_at` / `updated_at` | `TimeStampedModel` abstrakt modeli: `auto_now_add` / `auto_now` |
| O'chirish | Biznes yozuvlari jismonan o'chirilmaydi: foydalanuvchi → `is_active=False`; filial/kurs/xona → `is_active=False`; guruh → `status`; to'lov → `voided`; hisob (invoice) → `cancelled`. FK'lar asosan `PROTECT` |
| Shaxsiy ma'lumot | Faqat zarurlari: ism, familiya, telefon, email (ixtiyoriy), rasm, ota-ona kontakti (student uchun). Pasport va h.k. **yig'ilmaydi** |
| Fayllar | Avatar — public media. Kurs materiali, vazifa ilovasi, topshiriq fayllari — **private storage** (`PRIVATE_MEDIA_ROOT`), faqat ruxsat tekshiruvchi API orqali yuklab olinadi. Fayl nomi `uuid4` bilan almashtiriladi, asl nomi alohida maydonda |

Belgilar: **R** = majburiy, O = ixtiyoriy (null/blank), U = unique, I = indeks.

---

## 1. accounts

### 1.1 `User` (custom, `AUTH_USER_MODEL = "accounts.User"`)
`AbstractBaseUser + PermissionsMixin`. `USERNAME_FIELD = "phone"`, `REQUIRED_FIELDS = ["first_name", "last_name"]`.

| Maydon | Tur | R/O | Default | Izoh |
|---|---|---|---|---|
| phone | Char(16) | R, U | — | E.164. Normalizatsiya: probel/`-`/`()` olib tashlanadi; 9 raqam → `+998…`; `998…` → `+998…`. Validatsiya `^\+\d{10,15}$`, `+998` uchun aniq `^\+998\d{9}$` |
| email | Email(254) | O | `""` | Kichik harfga o'tkaziladi. **Unique (case-insensitive), faqat bo'sh bo'lmaganda**: `UniqueConstraint(Lower("email"), condition=~Q(email=""))` |
| first_name | Char(150) | R | | |
| last_name | Char(150) | R | | |
| role | Char(20) choices | R, I | `student` | `superadmin` / `admin` / `teacher` / `student` |
| branch | FK → Branch | O | null | `on_delete=PROTECT`. **Check:** `role='superadmin' OR branch IS NOT NULL` |
| avatar | Image | O | | `avatars/%Y/%m/<uuid>.<ext>`, jpg/png/webp, ≤ 2 MB |
| is_active | Bool | R, I | True | `False` = bloklangan (login va API ishlamaydi) |
| is_staff | Bool | R | False | Faqat Django admin uchun (superadmin) |
| must_change_password | Bool | R | False | Admin vaqtinchalik parol bergan bo'lsa |
| deactivated_at | DateTime | O | null | Bloklangan vaqt |
| last_login | DateTime | O | | AbstractBaseUser |
| created_at / updated_at | DateTime | R | auto | |

Indekslar: `(role, branch)`, `(last_name, first_name)`.
Login: `phone` yoki `email` (`@` bo'lsa email deb qaraladi) + parol.

### 1.2 `UserProfile` (1:1 User, `on_delete=CASCADE`)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| user | OneToOne → User | R, U | |
| birth_date | Date | O | |
| parent_name | Char(150) | O | Student uchun |
| parent_phone | Char(16) | O | Student uchun, E.164 |
| specialization | Char(150) | O | Teacher uchun (masalan "Frontend") |
| bio | Text(≤1000) | O | Teacher uchun |
| notes | Text(≤2000) | O | **Ichki izoh** — faqat admin/superadmin ko'radi |
| created_at / updated_at | | | |

Profil User yaratilganda servis orqali avtomatik yaratiladi.

---

## 2. organizations

### 2.1 `Branch`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| name | Char(150) | R, U | |
| code | Char(20) | R, U | Katta harf, `^[A-Z0-9-]{2,20}$` |
| address | Char(255) | O | |
| phone | Char(16) | O | |
| is_active | Bool | R | True; arxivlash |
| created_at / updated_at | | | |

### 2.2 `Room`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| branch | FK → Branch | R | PROTECT |
| name | Char(100) | R | |
| capacity | PositiveSmallInt | O | |
| is_active | Bool | R | True |
| created_at / updated_at | | | |
Constraint: `UniqueConstraint(branch, name)`.

### 2.3 `SystemSettings` (singleton, `pk=1`)
| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| center_name | Char(150) | "EduCentr" | Brend nomi |
| currency | Char(3) | "UZS" | |
| attendance_excused_policy | Char choices | `exclude` | `exclude` (uzrli dars maxrajdan chiqariladi) / `present` (keldi deb hisoblanadi) / `absent` (kelmadi deb hisoblanadi) |
| attendance_late_counts_present | Bool | True | Kechikkan = keldi |
| attendance_edit_window_hours | PositiveSmallInt | 48 | Ustoz dars tugaganidan keyin necha soat ichida davomatni o'zgartira oladi. Admin — cheklovsiz |
| max_upload_mb | PositiveSmallInt | 10 | 1..50 |
| allowed_upload_extensions | Char(500) | `pdf,doc,docx,txt,zip,rar,7z,png,jpg,jpeg,py,js,ts,html,css,json,ipynb,pptx,xlsx` | |
| invoice_due_day | PositiveSmallInt | 10 | Oyning qaysi kunigacha to'lanadi (1..28) |
| payment_void_window_hours | PositiveSmallInt | 24 | Admin to'lovni shu muddat ichida bekor qila oladi. Superadmin — cheklovsiz |
| teacher_reward_limit | PositiveSmallInt | 50 | Ustoz bir tranzaksiyada beradigan maksimal coin |
| updated_by | FK → User | null | SET_NULL |
| updated_at | DateTime | auto | |

---

## 3. courses

### 3.1 `Course`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| name | Char(150) | R | |
| code | Char(20) | R, U | |
| description | Text | O | |
| branch | FK → Branch | O | null = **global kurs** (faqat superadmin boshqaradi); qiymat bo'lsa — shu filial kursi (filial admini boshqaradi). PROTECT |
| duration_months | PositiveSmallInt | R | 1..60 |
| lessons_per_week | PositiveSmallInt | R | 1..7, default 3 |
| lesson_duration_minutes | PositiveSmallInt | R | 30..300, default 90 |
| monthly_price | Decimal(12,2) | R | Check `>= 0` |
| is_active | Bool | R | True |
| created_at / updated_at | | | |

### 3.2 `CourseMaterial`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| course | FK → Course | R | CASCADE |
| title | Char(200) | R | |
| description | Text | O | |
| file | File (private) | O | `materials/<course_id>/<uuid>.<ext>` |
| file_name | Char(255) | O | Asl nom |
| url | URL | O | |
| order | PositiveInt | R | 0 |
| created_by | FK → User | O | SET_NULL |
| created_at / updated_at | | | |
Check: `file <> '' OR url <> ''`.

---

## 4. groups

### 4.1 `Group`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| code | Char(30) | R, U | masalan `FE-2410` |
| name | Char(150) | R | |
| course | FK → Course | R | PROTECT. Kurs global yoki shu filialniki bo'lishi kerak |
| branch | FK → Branch | R, I | PROTECT |
| teacher | FK → User | O | PROTECT; `role=teacher`, shu filialdan |
| room | FK → Room | O | SET_NULL; shu filialdan |
| status | Char choices | R, I | `forming` / `active` / `completed` / `cancelled`; default `forming` |
| start_date | Date | R | |
| end_date | Date | O | Check `end_date IS NULL OR end_date >= start_date` |
| capacity | PositiveSmallInt | R | 20 (1..500) |
| days_of_week | JSON list[int] | R | `[]`; 0=Dushanba … 6=Yakshanba |
| lesson_start_time / lesson_end_time | Time | O | Check: ikkalasi bo'lsa `end > start` |
| created_at / updated_at | | | |
Indekslar: `(branch, status)`, `teacher`.

### 4.2 `GroupMembership` (studentning guruh tarixi + to'lov rejasi)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| group | FK → Group | R | PROTECT |
| student | FK → User | R | PROTECT; `role=student`, shu filialdan |
| status | Char choices | R, I | `active` / `frozen` / `completed` / `left` / `transferred`; default `active` |
| joined_at | Date | R | |
| left_at | Date | O | Check `left_at IS NULL OR left_at >= joined_at` |
| transferred_to | FK → GroupMembership | O | SET_NULL; ko'chirilganda yangi a'zolik |
| monthly_fee | Decimal(12,2) | R | Yozilish paytidagi kurs narxi (snapshot). Check `>= 0` |
| discount_type | Char choices | R | `none` / `percent` / `fixed`; default `none` |
| discount_value | Decimal(12,2) | R | 0. `percent` uchun 0..100; `fixed` uchun ≤ monthly_fee |
| discount_reason | Char(255) | O | |
| note | Char(255) | O | |
| created_by | FK → User | O | SET_NULL |
| created_at / updated_at | | | |

Constraintlar:
* `UniqueConstraint(group, student, condition=Q(status__in=["active","frozen"]))` — bitta guruhda bir vaqtning o'zida faqat bitta faol a'zolik. Tarix (`left`, `transferred`, `completed`) saqlanib qoladi.
* Oylik to'lov summasi (hisoblanadi, saqlanmaydi): `percent` → `fee − fee×value/100`; `fixed` → `fee − value`; `max(0, …)`, `ROUND_HALF_UP`.

---

## 5. schedules

### 5.1 `Lesson`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| group | FK → Group | R | CASCADE (lekin davomati bor dars `PROTECT` sababli o'chirilmaydi) |
| teacher | FK → User | R | PROTECT; default = group.teacher (o'rinbosar ustoz bo'lishi mumkin) |
| room | FK → Room | O | SET_NULL |
| date | Date | R, I | Mahalliy sana |
| start_time / end_time | Time | R | Check `end_time > start_time` |
| topic | Char(255) | O | Dars mavzusi |
| status | Char choices | R | `scheduled` / `completed` / `cancelled` |
| cancel_reason | Char(255) | O | |
| notes | Text | O | |
| created_by | FK → User | O | SET_NULL |
| created_at / updated_at | | | |

Constraintlar: `UniqueConstraint(group, date, start_time)` (dars generatsiyasi idempotent).
Indekslar: `(date, start_time)`, `(teacher, date)`, `(room, date)`, `(group, date)`.

**Konflikt qoidasi (servis qatlami, `select_for_update`):** bekor qilinmagan darslar orasida
bir xil `teacher` yoki bir xil `room` yoki bir xil `group` uchun bir sanada vaqt oraliqlari
kesishmasligi kerak: `a.start < b.end AND b.start < a.end`. Kesishsa — `400` va konflikt tafsiloti.

---

## 6. attendance

### 6.1 `AttendanceRecord`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| lesson | FK → Lesson | R | PROTECT |
| student | FK → User | R, I | PROTECT |
| status | Char choices | R | `present` / `absent` / `late` / `excused` |
| comment | Char(255) | O | |
| marked_by | FK → User | O | SET_NULL |
| created_at / updated_at | | | |
Constraint: `UniqueConstraint(lesson, student)`.
Student faqat dars sanasida guruhda faol a'zo bo'lsa belgilanadi: `joined_at <= lesson.date AND (left_at IS NULL OR left_at >= lesson.date) AND status IN (active, frozen*)` (*frozen — belgilanmaydi).

### 6.2 `AttendanceChange` (tahrir tarixi)
| Maydon | Tur | Izoh |
|---|---|---|
| record | FK → AttendanceRecord, CASCADE | |
| previous_status | Char | Birinchi belgilashda `""` |
| new_status | Char | |
| changed_by | FK → User, SET_NULL | |
| reason | Char(255) | O |
| changed_at | DateTime | auto |

**Davomat foizi (yagona formula — `attendance/services.py`):**
`attended = present + (late if late_counts_present)` (+ `excused` agar siyosat `present`)
`total = present + late + absent` (+ `excused` agar siyosat `present` yoki `absent`)
`rate = round(attended / total × 100, 1)`; `total = 0` → `null` ("ma'lumot yo'q").
Bekor qilingan darslar hisobga olinmaydi.

---

## 7. assignments

### 7.1 `Assignment`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| group | FK → Group | R, I | PROTECT |
| lesson | FK → Lesson | O | SET_NULL |
| title | Char(200) | R | |
| description | Text | R | |
| grading_criteria | Text | O | |
| max_score | PositiveSmallInt | R | 100 (1..1000) |
| due_at | DateTime | R | aware |
| allow_late | Bool | R | True |
| attachment | File (private) | O | `assignments/<group_id>/<uuid>.<ext>` |
| attachment_name | Char(255) | O | |
| link | URL | O | |
| status | Char choices | R | `draft` / `published` / `closed` |
| published_at | DateTime | O | |
| created_by | FK → User | R | PROTECT |
| created_at / updated_at | | | |
Indeks: `(group, status, due_at)`.

### 7.2 `AssignmentSubmission` (student × vazifa bo'yicha joriy holat)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| assignment | FK → Assignment | R | PROTECT |
| student | FK → User | R | PROTECT |
| status | Char choices | R | `submitted` / `under_review` / `needs_revision` / `graded` ("not submitted" = yozuv yo'q) |
| revision_count | PositiveSmallInt | R | 0 |
| last_submitted_at | DateTime | R | |
| is_late | Bool | R | Oxirgi yuborish `due_at` dan keyinmi |
| feedback | Text | O | Ustozning oxirgi izohi |
| reviewed_by | FK → User | O | SET_NULL |
| reviewed_at | DateTime | O | |
| created_at / updated_at | | | |
Constraint: `UniqueConstraint(assignment, student)`.

### 7.3 `SubmissionRevision` (har bir yuborish tarixi)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| submission | FK → AssignmentSubmission | R | CASCADE |
| number | PositiveSmallInt | R | 1, 2, … |
| text | Text(≤10000) | O | |
| file | File (private) | O | `submissions/<assignment_id>/<uuid>.<ext>` |
| file_name | Char(255) | O | |
| file_size | PositiveInt | O | bayt |
| link | URL | O | |
| is_late | Bool | R | |
| submitted_at | DateTime | R | auto |
Constraint: `UniqueConstraint(submission, number)`; Check: `text<>'' OR file<>'' OR link<>''`.

**Holat mashinasi:** (yo'q) → `submitted` → `under_review` → `graded` | `needs_revision` → (qayta yuborish) `submitted` …
Student qayta yubora oladi: holat `submitted` (hali ko'rilmagan) yoki `needs_revision` bo'lsa.
Deadline: `now > due_at` va `allow_late=False` → rad etiladi (`needs_revision` holatidan tashqari).

---

## 8. grades

### 8.1 `Grade`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| submission | OneToOne → AssignmentSubmission | R, U | PROTECT |
| assignment | FK → Assignment | R | PROTECT (denormalizatsiya, tez so'rov uchun) |
| student | FK → User | R, I | PROTECT |
| group | FK → Group | R, I | PROTECT |
| score | Decimal(6,2) | R | Check `score >= 0 AND score <= max_score` |
| max_score | Decimal(6,2) | R | Baholash paytidagi `assignment.max_score` |
| comment | Text | O | |
| graded_by | FK → User | R | PROTECT |
| created_at / updated_at | | | |

### 8.2 `GradeChange` (o'zgarish tarixi)
| Maydon | Tur | Izoh |
|---|---|---|
| grade | FK → Grade, CASCADE | |
| previous_score | Decimal(6,2) | null (birinchi baholashda) |
| new_score | Decimal(6,2) | |
| previous_comment / new_comment | Text | |
| changed_by | FK → User, SET_NULL | |
| changed_at | DateTime | auto |

---

## 9. payments

### 9.1 `Invoice` (oylik hisob / to'lov talabi)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| membership | FK → GroupMembership | R | PROTECT |
| student | FK → User | R, I | PROTECT (denorm) |
| group | FK → Group | R, I | PROTECT (denorm) |
| period | Date | R, I | Oyning 1-kuni |
| base_amount | Decimal(12,2) | R | `membership.monthly_fee`. Check `>= 0` |
| discount_amount | Decimal(12,2) | R | Check `>= 0` |
| amount | Decimal(12,2) | R | `base − discount`. Check `amount >= 0` |
| due_date | Date | R | `period` oyining `invoice_due_day` kuni |
| status | Char choices | R | `open` / `cancelled` (to'langanlik saqlanmaydi — hisoblanadi) |
| cancel_reason | Char(255) | O | |
| cancelled_by / cancelled_at | | O | |
| created_by | FK → User | O | SET_NULL |
| created_at / updated_at | | | |
Constraint: `UniqueConstraint(membership, period)` — bir oyga bitta hisob (takroriy generatsiyaning oldi olinadi).

### 9.2 `Payment`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| membership | FK → GroupMembership | R | PROTECT — qaysi guruh uchun to'lov |
| student | FK → User | R, I | PROTECT (denorm, `membership.student` ga teng) |
| amount | Decimal(12,2) | R | Check `amount > 0` |
| method | Char choices | R | `cash` / `card` / `transfer` / `click` / `payme` / `other` (faqat yozuv turi; gateway yo'q) |
| status | Char choices | R, I | `completed` / `voided` |
| paid_at | DateTime | R, I | Kelajakdagi sana taqiqlanadi |
| idempotency_key | UUID | R, U | Frontend har bir forma ochilishida yaratadi. Takroriy so'rov → mavjud to'lov qaytariladi |
| note | Char(255) | O | |
| received_by | FK → User | R | PROTECT |
| voided_at / voided_by / void_reason | | O | |
| created_at / updated_at | | | |
Kvitansiya raqami saqlanmaydi: `"{id:06d}"`.
**API orqali DELETE yo'q** — faqat `void` (audit bilan).
Qo'shimcha takror himoyasi: bir xil `(membership, amount, method)` 2 daqiqa ichida → `409`, `confirm_duplicate=true` bilan tasdiqlash mumkin.

**Balans formulalari (`payments/services.py`):**
* `charged(m) = Σ invoice.amount (status=open)`; `paid(m) = Σ payment.amount (status=completed)`
* `balance(m) = paid − charged` → manfiy = qarz; `debt(m) = max(0, charged − paid)`
* Student qarzi = `Σ_m debt(m)` (a'zoliklar bo'yicha, ortiqcha to'lov boshqa guruh qarzini yopmaydi)
* Invoice "to'langan / qisman / to'lanmagan" holati — FIFO taqsimot bilan o'qishda hisoblanadi.

---

## 10. notifications

### 10.1 `Notification`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| recipient | FK → User | R | CASCADE |
| type | Char choices | R | `assignment_new`, `assignment_graded`, `revision_requested`, `submission_new`, `schedule_changed`, `payment_reminder`, `payment_received`, `announcement`, `reward`, `system` |
| title | Char(200) | R | |
| body | Text | O | |
| link | Char(255) | O | Frontend yo'li (`/student/assignments/12`) |
| data | JSON | R | `{}` |
| is_read | Bool | R | False |
| read_at | DateTime | O | |
| created_at | DateTime | R | |
Indeks: `(recipient, is_read, created_at)`.
Yetkazish: faqat ilova ichida (in-app). Email/SMS/push — yo'q (provayder yo'q).

---

## 11. announcements

### 11.1 `Announcement`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| title | Char(200) | R | |
| body | Text(≤5000) | R | Oddiy matn (HTML render qilinmaydi — XSS himoyasi) |
| author | FK → User | R | PROTECT |
| branch | FK → Branch | O | null = barcha filiallar (faqat superadmin) |
| group | FK → Group | O | null = filialdagi barcha guruhlar. Guruh `branch` ga tegishli bo'lishi shart |
| audience_roles | JSON list[str] | R | `[]` = barcha rollar; aks holda `admin`/`teacher`/`student` dan |
| is_pinned | Bool | R | False |
| status | Char choices | R | `draft` / `published` |
| published_at | DateTime | O | |
| expires_at | DateTime | O | |
| created_at / updated_at | | | |
Ko'rinish qoidasi: `published`, muddati o'tmagan, `(branch IS NULL OR branch = user.branch)`,
`(group IS NULL OR user group a'zosi/ustozi)`, `(audience_roles = [] OR user.role IN audience_roles)`.

---

## 12. chat

### 12.1 `ChatRoom`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| kind | Char choices | R | `group` / `direct` |
| group | OneToOne → Group | O | CASCADE; `kind=group` uchun |
| direct_key | Char(50) | O, U | `"<min_id>:<max_id>"` — ikki foydalanuvchi uchun yagona xona |
| name | Char(150) | O | |
| created_by | FK → User | O | SET_NULL |
| last_message_at | DateTime | O, I | |
| created_at | DateTime | R | |
Check: `(kind='group' AND group IS NOT NULL) OR (kind='direct' AND direct_key IS NOT NULL)`.

### 12.2 `ChatMembership`
| Maydon | Tur | Izoh |
|---|---|---|
| room | FK → ChatRoom, CASCADE | |
| user | FK → User, CASCADE | |
| last_read_at | DateTime, O | o'qilmaganlar soni uchun |
| joined_at | DateTime | |
Constraint: `UniqueConstraint(room, user)`. Direct xonada — 2 a'zo. Guruh xonasida kirish huquqi
dinamik tekshiriladi (ustoz yoki faol student), a'zolik yozuvi o'qish holatini saqlash uchun.

### 12.3 `ChatMessage`
| Maydon | Tur | Izoh |
|---|---|---|
| room | FK → ChatRoom, CASCADE | |
| sender | FK → User, PROTECT | |
| body | Text | 1..2000 belgi |
| is_deleted | Bool | soft delete (moderatsiya) |
| edited_at | DateTime, O | |
| created_at | DateTime | |
Indeks: `(room, id)`. Spam cheklovi: 30 xabar/daqiqa/foydalanuvchi (DRF throttle).

---

## 13. rewards

### 13.1 `RewardTransaction`
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| student | FK → User | R, I | PROTECT |
| amount | Integer | R | Check `amount <> 0`. Musbat — mukofot, manfiy — sarf/jarima |
| category | Char choices | R | `attendance` / `homework` / `activity` / `behavior` / `manual` / `redeem` / `penalty` |
| reason | Char(255) | R | |
| group | FK → Group | O | SET_NULL (kontekst) |
| created_by | FK → User | R | PROTECT |
| created_at | DateTime | R | |
Balans = `Σ amount`. Manfiy tranzaksiyada balans < 0 bo'lib qolmasligi servisda
`select_for_update` (student qatori) bilan tekshiriladi.

---

## 14. audit

### 14.1 `AuditLog` (o'zgarmas)
| Maydon | Tur | R/O | Izoh |
|---|---|---|---|
| actor | FK → User | O | SET_NULL |
| actor_role | Char(20) | O | snapshot |
| action | Char(50) | R, I | `create`, `update`, `delete`, `login`, `login_failed`, `logout`, `password_change`, `password_reset`, `block`, `unblock`, `role_change`, `enroll`, `transfer`, `attendance_mark`, `grade`, `payment_create`, `payment_void`, `invoice_generate`, `invoice_cancel`, `settings_update`, … |
| entity_type | Char(100) | O | `"payments.Payment"` |
| entity_id | Char(64) | O | |
| entity_repr | Char(255) | O | |
| changes | JSON | R | `{field: [old, new]}` — parol, token va maxfiy maydonlar **hech qachon** yozilmaydi |
| branch | FK → Branch | O | SET_NULL (admin filtrlash uchun) |
| ip_address | GenericIP | O | |
| user_agent | Char(255) | O | |
| created_at | DateTime | R, I | |
Indekslar: `(entity_type, entity_id)`, `(actor, created_at)`, `(branch, created_at)`.
Model darajasida `save()` (mavjud yozuvni yangilash) va `delete()` taqiqlangan.

---

## 15. Simplejwt token blacklist
`rest_framework_simplejwt.token_blacklist` ilovasi: `OutstandingToken`, `BlacklistedToken` —
logout, parol o'zgarishi va bloklashda foydalanuvchining refresh tokenlari bekor qilinadi.

## 16. Munosabatlar diagrammasi (qisqa)

```
Branch 1─* Room          Branch 1─* User(admin/teacher/student)     User 1─1 UserProfile
Branch 1─* Course(branch=null → global)   Course 1─* CourseMaterial
Course 1─* Group *─1 Branch   Group *─1 User(teacher)   Group *─1 Room
Group 1─* GroupMembership *─1 User(student)      GroupMembership 1─* Invoice, Payment
Group 1─* Lesson *─1 User(teacher)   Lesson 1─* AttendanceRecord *─1 User(student)
AttendanceRecord 1─* AttendanceChange
Group 1─* Assignment 1─* AssignmentSubmission 1─* SubmissionRevision
AssignmentSubmission 1─1 Grade 1─* GradeChange
User 1─* Notification     Announcement *─1 Branch/Group
ChatRoom 1─* ChatMembership, ChatMessage     Group 1─1 ChatRoom(kind=group)
User(student) 1─* RewardTransaction          AuditLog *─1 User(actor)
```
