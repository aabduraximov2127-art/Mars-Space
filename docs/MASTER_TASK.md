# MASTER TASK — PROFESSIONAL EDUCATION MANAGEMENT PLATFORM

(Buyurtmachi tomonidan berilgan asl topshiriq matni — talablar manbai.)

## 1. Vazifa
Senior full-stack developer, software architect, UI/UX engineer, database architect va QA engineer sifatida
MARS IT School'ning o'quv platformasiga o'xshash, professional darajadagi Education Management System (EMS)
yaratish. To'rtta rol: Superadmin, Admin, Teacher, Student. Tizim o'zining mustaqil brendi, kod bazasi va
dizayniga ega. MARS sahifalari dizaynini takrorlash uchun faqat taqdim etilgan/ruxsat berilgan skrinshotlardan
foydalanish; ko'rilmagan sahifa dizaynini aniq bilaman deb taxmin qilmaslik.
ASOSIY MAQSAD: chiroyli demo emas — real ma'lumotlar bilan ishlaydigan, xavfsiz, testlangan, responsive va
deploymentga tayyor to'liq tizim.

## 2. Qat'iy qoidalar (ishdan oldin)
Joriy papka va fayllarni tekshirish; frontend/backend mavjudligini aniqlash; package.json, requirements,
settings, URL, modellar, Git holatini tekshirish; mavjud funksiya/xatolar ro'yxati; mavjud kodni sababsiz
o'chirmaslik; Git o'zgarishlarini saqlash, ruxsatsiz reset/force push/destructive DB amallari yo'q;
PROJECT_AUDIT.md, ARCHITECTURE.md, DATABASE_SCHEMA.md, API_SPECIFICATION.md, IMPLEMENTATION_PLAN.md;
skrinshotlarni sahifalar bo'yicha tahlil qilish, berilmaganini taxmin sifatida belgilash; xavfli
o'zgarishlardan oldin ma'lumotlarni himoya qilish.

## 3. Stack
Backend: Python, Django, DRF, PostgreSQL, JWT (djangorestframework-simplejwt), django-filter, drf-spectacular,
Django test/pytest, zarur bo'lsa Channels+Redis.
Frontend: React, Vite, TypeScript (yangi loyiha uchun afzal), React Router, Tailwind CSS, TanStack Query,
React Hook Form, Zod, Axios/fetch, Recharts, Lucide.
Deployment: Docker, Docker Compose, PostgreSQL, production server, Nginx (kerak bo'lsa), env variables,
HTTPS, DB backup va loglash. Versiyalar mosligini tekshirish, keraksiz kutubxonalarni ko'paytirmaslik, lock fayllar.

## 4. Arxitektura
`backend/`, `frontend/`, `docs/`, `docker-compose.yml`, `.env.example`, `README.md`.
Backend ilovalari: accounts, organizations, courses, groups, schedules, attendance, assignments, grades,
payments, notifications, announcements, chat, rewards, reports, audit.
Har app aniq vazifali; biznes mantiq service qatlamida; serializer, permission va DB constraintlardan maqsadli foydalanish.

## 5. Rollar va permissionlar (RBAC)
Frontendda yashirish bilan cheklanmaslik — barcha ruxsatlar backend API'da tekshiriladi.
**Superadmin:** umumiy dashboard; barcha filiallarni boshqarish; admin/ustoz/studentlarni boshqarish;
kurs/guruh/jadval; global sozlamalar; moliyaviy hisobotlar; rollar va permissionlarni boshqarish;
audit loglarni ko'rish; foydalanuvchini bloklash/qayta faollashtirish.
**Admin:** o'z filialini boshqarish; student va ustozlarni ro'yxatga olish; guruh va kurslar; dars jadvali;
studentni guruhga biriktirish/ko'chirish; davomat, baho, vazifalarni kuzatish; to'lovlarni ruxsat doirasida
qayd etish; filial statistikasi va hisobotlari; e'lonlar. Global sozlamalar va boshqa filiallarni boshqara olmaydi.
**Teacher:** faqat o'z guruhlari va ulardagi studentlar; dars jadvali; davomat belgilash; uy vazifasi yaratish;
topshiriqlarni tekshirish; baho va izoh; o'z guruhlari natijalari; ruxsat etilgan chatlar.
Biriktirilmagan guruh/studentlarni o'zgartira olmaydi.
**Student:** faqat o'z profili, kurslari, guruhi, jadvali, davomati; vazifalarni ko'rish va topshirish; o'z
baholari va izohlari; bildirishnomalar; ruxsat etilgan profil sozlamalari. Rolini o'zgartira olmaydi,
baho/davomatni tahrirlay olmaydi, boshqa student ma'lumotiga kira olmaydi.
**Qoidalar:** default rad; har endpoint uchun aniq permission; object-level tekshiruv; list endpointlarda rol
va filial bo'yicha filtr; frontend yuborgan user_id/role/branch_id ga ishonmaslik; muhim amallar audit logga;
har rol uchun ruxsat/taqiq testlari.

## 6. Authentication
Login, logout, access/refresh, token yangilash, joriy foydalanuvchi, parolni tiklash, parolni o'zgartirish,
akkauntni faollashtirish/bloklash, xavfsiz ro'yxatdan o'tkazish, admin tomonidan akkaunt yaratish.
Takroriy akkauntlar oldini olish; telefon va email validatsiya qoidalari. Parol ochiq saqlanmaydi; JWT xavfsiz;
refresh token saqlash usuli CSRF/XSS hisobga olingan; maxfiy kalitlar kodda emas. Email/SMS provayder
sozlanmagan holat hujjatlashtiriladi, ishlamaydigan funksiya tayyor deb ko'rsatilmaydi.

## 7. Modellar
User, UserProfile, Branch, Course, Group, GroupMembership, Lesson, AttendanceRecord, Assignment,
AssignmentSubmission, Grade, Payment, Announcement, Notification, ChatRoom, ChatMembership, ChatMessage,
RewardTransaction, AuditLog. Har model uchun: maydon/tur, majburiylik, default, FK/M2M, on_delete, unique va DB
constraint, indeks, created_at/updated_at, validatsiya, xavfsiz o'chirish/arxivlash.
Custom User birinchi migratsiyadan oldin; email va login siyosati; guruh-kurs munosabati; GroupMembership orqali
guruh tarixi; AttendanceRecord (dars, student) unique; topshiriq takroriy yuborish tarixi (revision);
Grade muallifi va o'zgarish tarixi; Payment audit izisiz o'chirilmaydi; pul DecimalField; timezone siyosati;
duplicate maydonlardan qochish; munosabatlarni hujjatlashtirish.

## 8. Admin dashboard (real ma'lumot)
Studentlar, ustozlar, faol guruhlar, kurslar soni; bugungi darslar; bugungi davomat; to'lovlar yig'indisi;
qarzdorlik; so'nggi faoliyat; davr bo'yicha grafiklar. Filterlar: sana oralig'i, filial, kurs, guruh, holat.
Har ko'rsatkich formulasi hujjatlashtiriladi; takroriy hisoblash yo'q; bo'sh holat to'g'ri ko'rsatiladi.

## 9. Student va Teacher management
Yaratish, tahrirlash, bloklash/faollashtirish, kurs/guruhga biriktirish, guruhni o'zgartirish, qidirish,
filtrlash, saralash, pagination, studentning o'quv tarixi, ustozning ish jadvali va guruhlari.
Student profili: ism, familiya, telefon, email, rasm, holat. Sezgir ma'lumot (pasport) zarurat bo'lmasa yig'ilmaydi.

## 10. Courses, Groups, Schedule
Kurs: nom, tavsif, davomiylik, narx, faol/nofaol, materiallar. Guruh: kod, nom, kurs, filial, ustoz,
studentlar, boshlanish/tugash, holat. Jadval: sana, boshlanish/tugash vaqti, guruh, ustoz, xona, mavzu.
Ustoz yoki xona uchun vaqt to'qnashuvi backendda oldini olinadi.

## 11. Attendance
Holatlar: Present, Absent, Excused, Late. Dars bo'yicha belgilash; guruh davomat jadvali; student tarixi;
kun/hafta/oy filter; foiz; tahrir tarixi; belgilanmagan darslar. Foiz formulasi (uzrli darslar) aniq
belgilanadi. Faqat ruxsatli ustoz/admin o'zgartiradi; audit.

## 12. Assignments va Grades
Teacher: vazifa, tavsif, muddat, baholash mezoni, fayl/havola, guruhga yuborish, tekshirish, izoh va baho,
qayta topshirishni talab qilish. Student: ko'rish, matn/fayl/havola yuborish, holat, baho va izoh.
Holatlar: Not submitted, Submitted, Under review, Needs revision, Graded, Late. Deadline, vaqt, fayl formati
va hajm tekshiriladi; boshqa student nomidan yuborib bo'lmaydi; muallif, vaqt, oldingi natijalar saqlanadi.

## 13. Payments
Kurs narxi, to'lov rejasi, to'lovlar tarixi, to'langan summa, qoldiq qarz, chegirmalar, sana va holat,
moliyaviy hisobotlar. Hisob-kitob backendda, float yo'q. Holatlar va vakolatlar aniq; takroriy to'lovning
oldini olish. Gateway faqat provayder/kalitlar bo'lsa; aks holda faqat ichki hisob.

## 14. Notifications, Announcements, Chat
Bildirishnomalar: yangi vazifa, yangi baho, jadval o'zgarishi, to'lov eslatmasi, muhim e'lonlar.
E'lonlar: barcha filial, muayyan filial, muayyan guruh, tegishli rol uchun.
Chat: guruh chat, ruxsat etilgan individual muloqot, muallif va vaqt, a'zolik/permission, spam/hajm cheklovi.
Real-time — Channels+Redis; ular bo'lmasa oddiy xabarlar API, real-time alohida bosqichda.

## 15. UI/UX
Dizayn qabul mezoni. Skrinshotlar tahlili (sidebar, header, karta, grid, rang, typography, radius, ikon,
modal/dropdown, hover/focus/active, breakpoint). Tokenlar yagona joyda. Har rol uchun alohida navigatsiya va
layout. Holatlar: loading, empty, error, success, validation, permission denied, network error, pagination,
filter natijasi yo'q. Keraksiz animatsiyasiz; accessibility, klaviatura, kontrast. Skrinshot bo'lmasa
taxminiy dizayn va hujjatlashtirish.

## 16. API
`/api/auth/`, `/api/users/`, `/api/branches/`, `/api/courses/`, `/api/groups/`, `/api/schedules/`,
`/api/attendance/`, `/api/assignments/`, `/api/submissions/`, `/api/grades/`, `/api/payments/`,
`/api/notifications/`, `/api/announcements/`, `/api/reports/` (nomlar moslashtirilishi mumkin).
Har endpoint: method, auth, permission, request/response sxema, validatsiya, status kod, xato, pagination/filter.
Swagger/OpenAPI. Frontend bilan mos kontrakt; biznes mantiqni ikki joyda hisoblamaslik.

## 17. Xavfsizlik
Broken access control, IDOR, SQL injection, XSS, CSRF, fayl yuklash, loglarda maxfiy ma'lumot, login
urinishlarini cheklash, CORS, prod DEBUG, env, ruxsatsiz kirish, mass assignment, to'lov/bahoni ruxsatsiz o'zgartirish.

## 18. Testlash
Backend: model, serializer, API, permission, business logic, DB constraint testlari.
Frontend: komponent, forma validatsiya, API integratsiya, loading/error, rolga xos navigatsiya.
E2E (Playwright). 12 majburiy ssenariy (IMPLEMENTATION_PLAN.md). Muammolarni yashirmaslik.

## 19. Bosqichlar
Phase 0 audit → 1 foundation → 2 core management → 3 learning → 4 dashboards → 5 qo'shimcha modullar →
6 UI polish → 7 QA → 8 deployment. Har bosqich oxirida: fayllarni ko'rish, lint/type-check, testlar,
tuzatish, hujjatlash, qolgan muammolarni qayd etish.

## 20. Deployment va README
README, .env.example, Dockerfile(lar), docker-compose.yml, migratsiya, superadmin yaratish, lokal buyruqlar,
test buyruqlari, Swagger URL, deployment yo'riqnomasi, backup/restore. Secret Git'ga qo'shilmaydi. Prod DB
tozalanmaydi; demo uchun idempotent seed.

## 21. Qabul mezonlari
Backend/frontend ishga tushadi; DB ulanishi; migratsiyalar; login va token yangilash; backend ruxsatlar;
CRUD; davomat-topshiriq-baho bog'liq; dashboard real ma'lumot; API hujjatlari; asosiy testlar o'tgan;
xavfsizlik muammolari hal/hujjatlashtirilgan; ishlamaydigan tugma yo'q; loading/empty/error holatlari;
responsive tekshirilgan; deployment yo'riqnomasi; konfiguratsiyalar aniq.

## 22. Yakuniy hisobot
Funksiyalar; arxitektura va DB; fayllar; test natijalari; ishga tushirish buyruqlari; lokal URL'lar; Swagger;
qo'lda sozlamalar; tugallanmagan funksiyalar; ma'lum xatolar; deployment keyingi qadamlari.
Ishlamaydigan funksiyani ishlaydi demaslik; ishga tushirilmagan testni o'tdi demaslik; ulanmagan tashqi xizmatni tayyor demaslik.
