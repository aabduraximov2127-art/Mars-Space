# API SPECIFICATION — EduCentr REST API

Base URL: `/api/` · Format: JSON (`multipart/form-data` — fayl yuklashda) · Aniq sxema: **OpenAPI 3**
(`/api/schema/`, Swagger UI: `/api/docs/`, ReDoc: `/api/redoc/`). Bu hujjat — dizayn darajasidagi kontrakt;
maydonlarning aniq ro'yxati avtomatik generatsiya qilingan OpenAPI sxemasida.

## 0. Umumiy qoidalar

### 0.1 Autentifikatsiya
* `Authorization: Bearer <access>` — access token (JWT, 15 daqiqa). Frontend uni **faqat xotirada** saqlaydi.
* Refresh token (7 kun, rotatsiya + blacklist) — `HttpOnly; SameSite=Strict; Secure(prod); Path=/api/auth/` cookie: `ec_refresh`.
  JavaScript uni o'qiy olmaydi (XSS'dan himoya). Cookie ishlatadigan endpointlar (`refresh`, `logout`)
  qo'shimcha `X-Requested-With: XMLHttpRequest` sarlavhasini talab qiladi (CSRF himoyasi — boshqa saytdan
  bunday sarlavha CORS preflight'siz yuborilmaydi).
* Har so'rovda foydalanuvchi bazadan yuklanadi: bloklangan (`is_active=False`) foydalanuvchi darhol `401` oladi.
* Rol, filial, `user_id` **hech qachon** so'rov tanasidan olinmaydi — faqat `request.user` dan.

### 0.2 Ruxsatlar (RBAC)
Rollar: `SA` superadmin, `AD` admin (o'z filiali), `TE` teacher (o'z guruhlari), `ST` student (o'zi).
* Default — **rad etish**. Har bir ViewSet harakati (`list`, `retrieve`, `create`, …) uchun ruxsat etilgan rollar aniq yoziladi.
* List/retrieve so'rovlari rol va filial bo'yicha **scope** qilingan querysetdan olinadi → begona obyekt `404` (IDOR himoyasi, mavjudligi oshkor qilinmaydi).
* Ko'rish huquqi bor, lekin o'zgartirish huquqi yo'q → `403`.

### 0.3 Xato formati (barcha endpointlar)
```json
{ "detail": "Ma'lumotlar noto'g'ri.", "code": "validation_error",
  "errors": { "phone": ["Bu telefon raqam bilan foydalanuvchi mavjud."] } }
```
| Status | Holat |
|---|---|
| 400 | Validatsiya (`code=validation_error`), biznes qoidasi buzilishi (`code=...` aniq) |
| 401 | Token yo'q/yaroqsiz/muddati o'tgan (`not_authenticated`, `token_not_valid`) |
| 403 | Ruxsat yo'q (`permission_denied`) |
| 404 | Topilmadi yoki scope'dan tashqarida (`not_found`) |
| 409 | Konflikt (takroriy to'lov, jadval to'qnashuvi — `conflict`) |
| 429 | Juda ko'p so'rov (`throttled`) |

### 0.4 Pagination, qidiruv, filter, saralash
* `?page=1&page_size=20` (max 100). Javob: `{ "count", "next", "previous", "results": [...] }`.
* `?search=` — matnli qidiruv; `?ordering=field,-field2`; filterlar — har bir endpointda ko'rsatilgan.
* Chat xabarlari: `?after_id=` / `?before_id=` (kursor uslubi).

### 0.5 Turlar
* Pul — string `"150000.00"`; sana — `YYYY-MM-DD`; vaqt — `HH:MM[:SS]`; datetime — ISO 8601 offset bilan.
* Rate limit: login 10/daq/IP, parol tiklash 5/soat/IP, chat xabari 30/daq/foydalanuvchi.

---

## 1. Auth — `/api/auth/`
| Method | Path | Ruxsat | So'rov | Javob / izoh |
|---|---|---|---|---|
| POST | `login/` | Hamma (throttle) | `{login, password}` (`login` = telefon yoki email) | `200 {access, user}` + `ec_refresh` cookie. `400 invalid_credentials` (umumiy xabar), `403 account_disabled`, 5 ta xato urinishdan so'ng 15 daq blok `429` |
| POST | `refresh/` | Cookie + `X-Requested-With` | — | `200 {access}` + yangi cookie (rotatsiya). `401` |
| POST | `logout/` | Cookie + `X-Requested-With` | — | `204`, refresh blacklist, cookie o'chiriladi |
| GET | `me/` | Auth | — | Joriy foydalanuvchi + profil + filial nomi |
| PATCH | `me/` | Auth | `{first_name, last_name, email, avatar}` | Rol/filial/telefon/holat **o'zgartirib bo'lmaydi** |
| POST | `change-password/` | Auth | `{old_password, new_password}` | `204`; boshqa sessiyalar (refresh tokenlar) bekor qilinadi, yangi `access` + cookie |
| POST | `password-reset/` | Hamma (throttle) | `{email}` | Har doim `200` (foydalanuvchi mavjudligi oshkor qilinmaydi). Email backend sozlanmagan bo'lsa xat konsolga chiqadi |
| POST | `password-reset/confirm/` | Hamma | `{uid, token, new_password}` | `204` / `400 invalid_token` |

Parol siyosati: Django validatorlari (min 8, oddiy emas, faqat raqam emas, foydalanuvchi ma'lumotiga o'xshamas).

## 2. Users — `/api/users/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` | ✓ | filial | o'z guruhlaridagi studentlar (cheklangan maydonlar) | ✗ | filter: `role, branch, is_active, group`; search: ism, familiya, telefon, email; ordering: `last_name, created_at` |
| POST | `` | ✓ (har qanday rol) | teacher/student, o'z filialiga majburan | ✗ | ✗ | `{phone, email?, first_name, last_name, role, branch?, password?, profile:{...}}`. Parol berilmasa — tasodifiy vaqtinchalik parol javobda **bir marta** qaytariladi, `must_change_password=true` |
| GET | `{id}/` | ✓ | filial | ✓ (o'z studenti) | ✗ | |
| PATCH | `{id}/` | ✓ | o'z filiali teacher/student | ✗ | ✗ | `role`, `branch`, `is_active` bu yerda o'zgarmaydi |
| POST | `{id}/block/` | ✓ | teacher/student | ✗ | ✗ | `{reason?}` → `is_active=false`, barcha refresh tokenlar bekor. O'zini bloklay olmaydi |
| POST | `{id}/unblock/` | ✓ | teacher/student | ✗ | ✗ | |
| POST | `{id}/set-password/` | ✓ | teacher/student | ✗ | ✗ | `{new_password?}` → vaqtinchalik parol, `must_change_password=true` |
| POST | `{id}/change-role/` | ✓ | ✗ | ✗ | ✗ | `{role, branch?}`; oxirgi faol superadminni tushirib bo'lmaydi |
| GET | `{id}/study-history/` | ✓ | filial | o'z studenti | ✗ | Student: a'zoliklar tarixi, guruh bo'yicha davomat foizi, baholar o'rtachasi, (SA/AD uchun) balans |
| GET | `{id}/teaching-overview/` | ✓ | filial | o'zi | ✗ | Teacher: guruhlar, yaqin darslar, haftalik yuklama |

Takroriy akkaunt: `phone` unique; `email` (bo'sh bo'lmasa) case-insensitive unique → `400`.

## 3. Organizations
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `/api/branches/` | ✓ | o'z filiali | o'z filiali | o'z filiali | filter `is_active`; search `name, code` |
| POST/PATCH | `/api/branches/`, `{id}/` | ✓ | ✗ | ✗ | ✗ | DELETE yo'q — `is_active=false` |
| GET | `/api/rooms/` | ✓ | filial | filial | ✗ | filter `branch, is_active` |
| POST/PATCH/DELETE | `/api/rooms/…` | ✓ | filial (branch majburan o'ziniki) | ✗ | ✗ | DELETE faqat darslarda ishlatilmagan bo'lsa, aks holda `is_active=false` |
| GET | `/api/settings/` | ✓ | o'qish | ✗ | ✗ | |
| PATCH | `/api/settings/` | ✓ | ✗ | ✗ | ✗ | audit `settings_update` |
| GET | `/api/settings/public/` | Auth | | | | `{center_name, currency, attendance_excused_policy, max_upload_mb, allowed_upload_extensions}` |

## 4. Courses — `/api/courses/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | ✓ | global + filial | o'z guruhlari kurslari | o'z guruhlari kurslari | filter `branch, is_active`; search `name, code` |
| POST | `` | ✓ (global yoki filial) | filial kursi (branch majburan) | ✗ | ✗ | |
| PATCH | `{id}/` | ✓ | faqat o'z filiali kursi | ✗ | ✗ | DELETE yo'q — `is_active=false` |
| GET | `{id}/materials/` | ✓ | ✓ | ✓ (o'z kursi) | ✓ (o'z kursi) | |
| POST | `{id}/materials/` | ✓ | o'z filiali kursi | ✗ | ✗ | multipart `{title, description?, file? , url?}` |
| PATCH/DELETE | `/api/course-materials/{id}/` | ✓ | o'z filiali kursi | ✗ | ✗ | |
| GET | `/api/course-materials/{id}/download/` | kursni ko'ra oladiganlar | | | | `Content-Disposition: attachment` |

## 5. Groups — `/api/groups/`, `/api/memberships/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `/api/groups/` , `{id}/` | ✓ | filial | `teacher=self` | a'zo bo'lgan guruhlar | filter `branch, course, teacher, status`; search `name, code`. Javobda `students_count` |
| POST/PATCH | `/api/groups/…` | ✓ | filial | ✗ | ✗ | Validatsiya: kurs global/filialniki, ustoz shu filial teacher'i, xona shu filialdan |
| GET | `/api/groups/{id}/students/` | ✓ | filial | o'z guruhi | ✗ | faol a'zolar (+ `?include_history=1`) |
| POST | `/api/groups/{id}/generate-lessons/` | ✓ | filial | ✗ | ✗ | `{date_from, date_to}` → `days_of_week` va vaqt bo'yicha darslar; konflikt/mavjudlari o'tkazib yuboriladi: `{created, skipped:[{date, reason}]}` |
| GET | `/api/groups/{id}/attendance-sheet/` | ✓ | filial | o'z guruhi | ✗ | `?date_from&date_to` → darslar × studentlar matritsasi + har student foizi |
| GET | `/api/groups/{id}/gradebook/` | ✓ | filial | o'z guruhi | ✗ | vazifalar × studentlar balllari |
| GET | `/api/memberships/` | ✓ | filial | o'z guruhlari | o'ziniki | filter `group, student, status` |
| POST | `/api/memberships/` | ✓ | filial | ✗ | ✗ | Yozish: `{group, student, joined_at, discount_type?, discount_value?, discount_reason?}`; `monthly_fee` = kurs narxi (snapshot). Sig'im, takroriy faol a'zolik, rol/filial tekshiriladi. Audit `enroll` |
| PATCH | `/api/memberships/{id}/` | ✓ | filial | ✗ | ✗ | Faqat chegirma maydonlari va `note` |
| POST | `/api/memberships/{id}/freeze/` / `activate/` / `leave/` | ✓ | filial | ✗ | ✗ | `leave`: `{left_at, reason?}` |
| POST | `/api/memberships/{id}/transfer/` | ✓ (filiallararo) | filial ichida | ✗ | ✗ | `{to_group, date}` → eski `transferred`, yangi `active` (chegirma ko'chiriladi). Audit `transfer` |

## 6. Schedule — `/api/lessons/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | ✓ | filial | `teacher=self` yoki `group.teacher=self` | faol guruhlari darslari | filter `date_from, date_to, group, teacher, room, status, branch` |
| POST | `` | ✓ | filial | ✗ | ✗ | `{group, date, start_time, end_time, teacher?, room?, topic?}` → konflikt `409 {conflicts:[...]}` |
| PATCH | `{id}/` | ✓ | filial (barcha maydon) | o'z darsi: faqat `topic, notes` | ✗ | Sana/vaqt/xona o'zgarsa — konflikt tekshiruvi + `schedule_changed` bildirishnomasi |
| POST | `{id}/cancel/` | ✓ | filial | ✗ | ✗ | `{reason}`; bildirishnoma |
| DELETE | `{id}/` | ✓ | filial | ✗ | ✗ | Faqat davomat/vazifa bog'lanmagan bo'lsa (aks holda `400`, bekor qilish taklif etiladi) |

## 7. Attendance — `/api/attendance/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `/api/attendance/` | ✓ | filial | o'z guruhlari | o'ziniki | filter `group, student, lesson, status, date_from, date_to` |
| GET | `/api/attendance/lesson/{lesson_id}/` | ✓ | filial | o'z darsi | ✗ | Dars uchun belgilash varag'i: shu sanada faol studentlar + joriy holat |
| POST | `/api/attendance/lesson/{lesson_id}/mark/` | ✓ | filial (cheklovsiz) | o'z darsi, dars tugaganidan `attendance_edit_window_hours` ichida; kelajakdagi darsni belgilab bo'lmaydi | ✗ | `{records:[{student, status, comment?}], reason?}` → upsert, har o'zgarish `AttendanceChange` ga, dars `completed`. Begona student → `400`. Audit `attendance_mark` |
| GET | `/api/attendance/summary/` | ✓ | filial | o'z guruhlari | o'ziniki | `?student=&group=&date_from&date_to` → `{present, absent, late, excused, total_lessons, rate}` |
| GET | `/api/attendance/unmarked-lessons/` | ✓ | filial | o'ziniki | ✗ | O'tgan, bekor qilinmagan, davomati belgilanmagan darslar |
| GET | `/api/attendance/{id}/history/` | ✓ | filial | o'z guruhi | ✗ | `AttendanceChange` ro'yxati |

## 8. Assignments — `/api/assignments/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | ✓ | filial | o'z guruhlari | faol guruhidagi `published`/`closed` | filter `group, status, due_from, due_to`. Student javobida `my_submission` (holat, ball) |
| POST | `` | ✓ | filial | o'z guruhi | ✗ | multipart `{group, title, description, due_at, max_score, grading_criteria?, allow_late?, attachment?, link?, lesson?, status=draft|published}` |
| PATCH | `{id}/` | ✓ | filial | o'ziniki | ✗ | Baholangan topshiriq bo'lsa `max_score` o'zgarmaydi |
| POST | `{id}/publish/`, `{id}/close/` | ✓ | filial | o'ziniki | ✗ | publish → guruh studentlariga `assignment_new` |
| DELETE | `{id}/` | ✓ | filial | o'ziniki | ✗ | Faqat topshiriq yo'q bo'lsa |
| GET | `{id}/submissions/` | ✓ | filial | o'ziniki | ✗ | Har bir faol student: holat (`not_submitted` ham), oxirgi yuborish, ball |
| GET | `{id}/attachment/` | ko'ra oladiganlar | | | | fayl yuklab olish |

## 9. Submissions — `/api/submissions/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | ✓ | filial | o'z guruhlari | o'ziniki | filter `assignment, student, status, group`. Revisions bilan |
| POST | `` | ✗ | ✗ | ✗ | ✓ | multipart `{assignment, text?, file?, link?}` — yaratish yoki qayta yuborish (yangi revision). `student = request.user` (so'rovdan olinmaydi). Fayl: kengaytma va hajm `SystemSettings` bo'yicha |
| POST | `{id}/start-review/` | ✗ | ✗ | o'z guruhi | ✗ | `submitted → under_review` |
| POST | `{id}/request-revision/` | ✗ | ✗ | o'z guruhi | ✗ | `{feedback}` → `needs_revision`, studentga bildirishnoma |
| POST | `{id}/grade/` | ✗ | ✗ | o'z guruhi | ✗ | `{score, comment?}` → `Grade` yaratiladi/yangilanadi (+`GradeChange`), `graded`, bildirishnoma. `0 ≤ score ≤ max_score` |
| GET | `{id}/revisions/{number}/file/` | ✓ | filial | o'z guruhi | o'ziniki | fayl yuklab olish |

## 10. Grades — `/api/grades/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | ✓ | filial | o'z guruhlari | o'ziniki | filter `group, student, assignment` |
| PATCH | `{id}/` | ✗ | ✗ | o'z guruhi | ✗ | `{score, comment}` + tarix |
| GET | `{id}/history/` | ✓ | filial | o'z guruhi | o'ziniki | |
| GET | `summary/` | ✓ | filial | o'z guruhlari | o'ziniki | `?student=&group=` → o'rtacha foiz, baholangan soni |

## 11. Payments — `/api/payments/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `/api/payments/` , `{id}/` | ✓ | filial | ✗ | o'ziniki | filter `student, group, method, status, date_from, date_to, branch` |
| POST | `/api/payments/` | ✓ | filial | ✗ | ✗ | `{membership, amount, method, paid_at?, note?, idempotency_key, confirm_duplicate?}`. Takroriy kalit → `200` mavjud yozuv; 2 daqiqa ichidagi o'xshash to'lov → `409 duplicate_suspected` |
| POST | `/api/payments/{id}/void/` | ✓ | filial, `payment_void_window_hours` ichida | ✗ | ✗ | `{reason}` (majburiy). DELETE endpoint **yo'q** |
| GET | `/api/invoices/` | ✓ | filial | ✗ | o'ziniki | filter `student, group, period, status`; javobda `paid_amount`, `payment_state` (FIFO) |
| POST | `/api/invoices/generate/` | ✓ | filial | ✗ | ✗ | `{period:"YYYY-MM", group?}` — idempotent: `{created, skipped}` |
| POST | `/api/invoices/{id}/cancel/` | ✓ | filial | ✗ | ✗ | `{reason}` |
| GET | `/api/balances/` | ✓ | filial | ✗ | o'ziniki | Har a'zolik: `charged, paid, balance, debt`. filter `group, branch, has_debt` |
| GET | `/api/balances/summary/` | ✓ | filial | ✗ | ✗ | `{total_charged, total_paid, total_debt, debtors_count}` |
| POST | `/api/payments/send-reminders/` | ✓ | filial | ✗ | ✗ | Qarzdorlarga `payment_reminder` bildirishnomasi: `{notified}` |

## 12. Notifications — `/api/notifications/`
| GET `` (filter `is_read, type`) · GET `unread-count/` · POST `{id}/read/` · POST `read-all/` — faqat **o'z** bildirishnomalari, barcha rollar. |
|---|

## 13. Announcements — `/api/announcements/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `` , `{id}/` | hammasi | filial + global | ko'rinish qoidasi | ko'rinish qoidasi | `?pinned=1` |
| POST/PATCH/DELETE | | ✓ (har qanday scope) | faqat o'z filiali (branch majburan) | ✗ | ✗ | publish paytida auditoriyaga `announcement` bildirishnomasi |

## 14. Chat — `/api/chat/`
| Method | Path | Ruxsat | Izoh |
|---|---|---|---|
| GET | `rooms/` | Auth | Mening xonalarim: direct + men ustoz/faol student bo'lgan guruh xonalari; `unread_count`, `last_message` |
| POST | `rooms/direct/` | Auth | `{user_id}` — ruxsat etilgan juftlik: TE↔o'z studenti, AD↔filialdagi har kim, SA↔har kim. ST↔ST taqiqlangan. Mavjud xona qaytariladi |
| GET | `rooms/group/{group_id}/` | Guruh a'zosi/ustozi, AD(filial), SA | Guruh xonasini olish/yaratish |
| GET | `rooms/{id}/messages/` | Xona a'zosi | `?after_id=` (polling) / `?before_id=` (tarix), 50 tadan |
| POST | `rooms/{id}/messages/` | Xona a'zosi (throttle 30/daq) | `{body}` 1..2000 belgi |
| DELETE | `messages/{id}/` | Muallif, AD(filial), SA | soft delete |
| POST | `rooms/{id}/read/` | Xona a'zosi | `last_read_at = now` |
| GET | `contacts/` | Auth | Yozish mumkin bo'lgan foydalanuvchilar |
Real-time: hozircha polling (5 s). Django Channels + Redis — keyingi bosqich.

## 15. Rewards — `/api/rewards/`
| Method | Path | SA | AD | TE | ST | Izoh |
|---|---|---|---|---|---|---|
| GET | `/api/rewards/` | ✓ | filial | o'z guruhlari studentlari | o'ziniki | filter `student, group, category` |
| POST | `/api/rewards/` | ✓ | filial | o'z guruhi studenti, `|amount| ≤ teacher_reward_limit`, `redeem` emas | ✗ | `{student, amount, category, reason, group?}`; balans manfiy bo'lmaydi |
| GET | `/api/rewards/balance/` | ✓ | filial | o'z studenti | o'ziniki | `?student=` |
| GET | `/api/rewards/leaderboard/` | ✓ | filial | o'z guruhi | o'z guruhi | `?group=` → top 20 (`ism + familiya bosh harfi`, coin) |

## 16. Reports — `/api/reports/`
| Method | Path | Ruxsat | Izoh |
|---|---|---|---|
| GET | `dashboard/` | Auth (rolga mos) | SA/AD: KPI'lar, grafiklar, so'nggi faoliyat; TE: bugungi darslar, belgilanmagan davomat, tekshirilmagan topshiriqlar; ST: jadval, davomat foizi, vazifalar, baholar, balans, coin. Filterlar (SA/AD): `date_from, date_to, branch(SA), course, group, status` |
| GET | `finance/` | SA, AD | Davr bo'yicha tushum (kun/oy), filial/kurs kesimi, qarzdorlar. `?format=csv` |
| GET | `attendance/` | SA, AD, TE | Guruhlar bo'yicha davomat foizi |
| GET | `academic/` | SA, AD, TE | Guruhlar bo'yicha o'rtacha ball, topshirish darajasi |

KPI formulalari `ARCHITECTURE.md` §9 da.

## 17. Audit — `/api/audit-logs/`
| GET `` , `{id}/` — faqat SA. filter `actor, action, entity_type, branch, date_from, date_to`. Yozish/o'chirish endpointi yo'q. |
|---|

## 18. Tizim
| GET `/api/health/` — `{status:"ok", database:"ok"}` (monitoring, autentifikatsiyasiz) |
|---|
