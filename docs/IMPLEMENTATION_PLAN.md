# IMPLEMENTATION PLAN — EduCentr

Holat belgilari: ✅ bajarildi va tekshirildi · 🟡 qisman · ⬜ boshlanmagan · ⛔ bu muhitda tekshirib bo'lmaydi

## Ishni taqsimlash tamoyili
1. **Poydevor (bir qo'lda, izchillik uchun):** sozlamalar, `core` (RBAC, scope, xato formati, storage),
   auth, **barcha modellar va migratsiyalar**, audit/notify servislari, frontend skeleti (dizayn tokenlari,
   UI kit, API klient, auth, rol layout'lari, router).
2. **Modullar (parallel):** har agent faqat o'z app/feature papkalarida ishlaydi; modellar o'zgarishi faqat
   o'z app'ida va `makemigrations --check` bilan. Har agent alohida test DB nomidan foydalanadi (`TEST_DB_NAME`).
3. **QA:** ssenariy testlari (12 majburiy), permission audit, xavfsizlik ko'rigi (mustaqil tekshiruv bilan), E2E.

## Bosqichlar

| Bosqich | Mazmun | Natija mezoni | Holat |
|---|---|---|---|
| Phase 0 | Audit, arxitektura, DB sxema, API kontrakt, dizayn, reja | `docs/*.md` | ✅ |
| Phase 1 | Backend/frontend konfiguratsiya, custom User, PostgreSQL, env, JWT (cookie refresh), RBAC, birinchi migratsiyalar, bazaviy testlar | `migrate` ✓, auth testlari ✓, `npm run build` ✓ | ⬜ |
| Phase 2 | Filiallar, xonalar, kurslar, guruhlar, a'zolik/ko'chirish, teacher/student boshqaruvi, dars jadvali (konflikt tekshiruvi, generatsiya), qidiruv/filter/pagination | API + permission testlari ✓, sahifalar ✓ | ⬜ |
| Phase 3 | Davomat (+tarix, foiz), vazifalar, topshiriqlar (revision), baholash (+tarix), student progress | testlar ✓ | ⬜ |
| Phase 4 | 4 ta rol dashboardi, real statistikalar, KPI formulalari | testlar ✓ | ⬜ |
| Phase 5 | To'lovlar (invoice, payment, void, balans), bildirishnomalar, e'lonlar, coinlar, hisobotlar (CSV), chat (REST + polling) | testlar ✓ | ⬜ |
| Phase 6 | UI polish: responsive, holatlar, accessibility, performance (lazy routes) | build ✓, vizual tekshiruv | ⬜ |
| Phase 7 | Barcha testlar, permission audit, 12 ssenariy, regressiya, `check --deploy` | hammasi yashil | ⬜ |
| Phase 8 | Docker, compose, Nginx, prod env, backup/restore, README | fayllar ✓ (Docker ⛔ — o'rnatilmagan) | ⬜ |

## Majburiy ssenariylar (Phase 7, `backend/tests/test_scenarios.py` + Playwright smoke)
1. Superadmin yangi admin yaratadi · 2. Admin student va ustoz yaratadi · 3. Student guruhga biriktiriladi ·
4. Ustoz o'z guruhida davomat belgilaydi · 5. Student davomatni ko'radi · 6. Ustoz vazifa beradi ·
7. Student topshiradi · 8. Ustoz tekshirib baholaydi · 9. Student bahosini ko'radi · 10. Admin to'lov qayd etadi ·
11. Dashboard ko'rsatkichlari yangilanadi · 12. Ruxsatsiz foydalanuvchi begona ma'lumotga kira olmaydi.

## Har bosqich yakunida
O'zgargan fayllarni ko'rib chiqish → `ruff check` + `tsc --noEmit` + `eslint` → testlar → xatolarni tuzatish →
ushbu jadvalni yangilash → qolgan muammolarni "Ma'lum muammolar" bo'limiga yozish.

## Ma'lum muammolar / qoldiqlar
(bosqichlar davomida to'ldiriladi)
