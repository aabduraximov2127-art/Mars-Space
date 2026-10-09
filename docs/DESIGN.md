# DESIGN — EduCentr dizayn tizimi

## 0. Manba va cheklov
MARS IT School platformasining skrinshotlari **taqdim etilmagan**. Shu sababli EduCentr — mustaqil brend va
original dizayn: zamonaviy ta'lim boshqaruv tizimlariga xos tuzilma (chap sidebar, KPI kartalar, jadvallar).
Bu dizayn MARS'ning aniq nusxasi **emas**. Skrinshotlar berilsa, sahifalar bo'yicha taqqoslash
(`§8`) qilinadi va farqlar shu yerda qayd etiladi.

## 1. Dizayn tokenlari (yagona manba: `frontend/src/styles/index.css`, Tailwind 4 `@theme`)

### Ranglar
| Token | Qiymat | Ishlatilishi |
|---|---|---|
| `brand-50 … brand-950` | `#F3F2FF` `#E8E5FF` `#D2CCFE` `#B1A5FC` `#8D7AF8` `#6F57F1` `#5B3FE4` `#4C31C8` `#3F2AA2` `#352780` `#1F174D` | Asosiy brend (binafsha-indigo). Tugma: `brand-600`, hover `brand-700` |
| `ink-*` (slate) | Tailwind slate | Matn: sarlavha `ink-900`, asosiy `ink-700`, ikkilamchi `ink-500` |
| `canvas` | `#F5F6FA` | Ilova foni |
| `surface` | `#FFFFFF` | Kartalar, jadval, modal |
| `line` | `#E6E8EF` | Chegaralar |
| `success` | `#059669` (fon `#ECFDF5`) | Keldi, to'langan, faol |
| `warning` | `#D97706` (fon `#FFFBEB`) | Kechikdi, qisman, muzlatilgan |
| `danger` | `#E11D48` (fon `#FFF1F2`) | Kelmadi, qarz, bloklangan, xato |
| `info` | `#0284C7` (fon `#F0F9FF`) | Uzrli, ma'lumot |
| `coin` | `#F59E0B` | Mukofot coinlari |

Kontrast: matn/fon juftliklari WCAG AA (≥ 4.5:1) — `ink-500` oq fonda 4.8:1; brend tugmada oq matn 6.4:1.

### Tipografiya
`Inter Variable` (self-hosted, `@fontsource-variable/inter`, lotin + kirill + ʻ belgilar), zaxira: system-ui.
| Rol | O'lcham / qalinlik |
|---|---|
| Sahifa sarlavhasi | 24px / 600, `tracking-tight` |
| Bo'lim sarlavhasi | 18px / 600 |
| Karta sarlavhasi | 15px / 600 |
| Asosiy matn | 14px / 400, line-height 1.5 |
| Kichik / yorliq | 12–13px / 500 |
| KPI raqami | 28px / 650, `tabular-nums` |

### O'lcham, radius, soya, z-index
* Spacing: 4px setka (Tailwind default).
* Radius: `sm 6px` (badge), `md 8px` (input, tugma), `lg 12px` (karta), `xl 16px` (modal).
* Soya: `card: 0 1px 2px rgb(16 24 40 / .05)`, `pop: 0 12px 32px -8px rgb(16 24 40 / .18)`.
* Z-index: `header 30`, `dropdown 40`, `drawer 50`, `modal 60`, `toast 70`.
* Breakpointlar: `sm 640`, `md 768`, `lg 1024` (sidebar doimiy), `xl 1280`, `2xl 1536`.
* Animatsiya: 150–200 ms `ease-out` (modal/drawer/dropdown, hover). `prefers-reduced-motion` da o'chadi.

## 2. Layout
* **Sidebar** — 264px, oq fon, o'ng chegara; tepada logo + markaz nomi; bo'limlar bo'yicha guruhlangan navigatsiya;
  faol element `brand-50` fon + `brand-700` matn + chap 3px indikator. `< lg` — chapdan chiquvchi drawer (overlay, focus trap, `Esc`).
* **Header** — 64px, oq, sticky; chapda mobil menyu tugmasi + sahifa sarlavhasi; o'ngda bildirishnoma qo'ng'irog'i
  (o'qilmaganlar badge), profil menyusi (ism, rol, profil, parolni o'zgartirish, chiqish).
* **Kontent** — `max-w-[1400px]`, padding `24px` (mobil `16px`), `canvas` fon.
* Rol bo'yicha navigatsiya:
  * **Superadmin**: Dashboard · Filiallar · Adminlar · Ustozlar · Studentlar · Kurslar · Guruhlar · Dars jadvali · Davomat · To'lovlar · Hisobotlar · E'lonlar · Chat · Audit log · Sozlamalar
  * **Admin**: Dashboard · Studentlar · Ustozlar · Kurslar · Guruhlar · Dars jadvali · Davomat · Vazifalar · To'lovlar · Qarzdorlar · Hisobotlar · E'lonlar · Chat · Xonalar
  * **Teacher**: Dashboard · Guruhlarim · Dars jadvali · Davomat · Vazifalar · Baholar · Coinlar · Chat · E'lonlar
  * **Student**: Dashboard · Guruhlarim · Dars jadvali · Davomatim · Vazifalar · Baholarim · To'lovlarim · Coinlarim · Chat · E'lonlar

## 3. Komponentlar (`components/ui`)
Button (primary/secondary/ghost/danger; sm/md; loading), IconButton, Input, Textarea, Select, Checkbox, Switch,
FormField (label + hint + error, `aria-describedby`), SearchInput (debounce 300 ms), DateInput,
Card, StatCard (KPI + o'zgarish %), Badge/StatusBadge, Avatar (rasm yoki initsiallar), Table (sticky header,
saralash, mobil'da gorizontal scroll), Pagination, Tabs, Dropdown/Menu, Modal (focus trap, `Esc`, `aria-modal`),
ConfirmDialog, Drawer, Skeleton, Spinner, EmptyState, ErrorState, PermissionDenied, PageHeader (sarlavha +
amallar), FilterBar, Toaster (sonner).

Holatlar: hover (fon 1 pog'ona to'qroq), `focus-visible` (2px `brand-500` ring + offset), active, disabled (opacity 50%, `cursor-not-allowed`), loading (spinner + `aria-busy`).

## 4. Sahifa holatlari (har sahifada majburiy)
| Holat | Ko'rinish |
|---|---|
| Loading | Skeleton (jadval qatorlari / kartalar) — layout sakramaydi |
| Empty | Ikon + "Hali … yo'q" + asosiy amal tugmasi (ruxsat bo'lsa) |
| Filter natijasi yo'q | "Hech narsa topilmadi" + "Filterni tozalash" |
| Error | Xabar + "Qayta urinish" |
| Network error | "Internet aloqasini tekshiring" + qayta urinish |
| 403 | PermissionDenied komponenti |
| 404 | "Topilmadi" sahifasi |
| Success | Toast (yashil), forma yopiladi, ro'yxat yangilanadi (query invalidation) |
| Validation | Maydon ostida qizil matn (frontend Zod + backend `errors` xaritasi) |

## 5. Ma'lumot ko'rsatish
* Pul: `1 250 000 so'm` (`Intl.NumberFormat('uz-UZ')`, probel bilan guruhlash), backend string'idan.
* Sana: `07.10.2026`; vaqt `14:30`; nisbiy vaqt bildirishnomalarda ("5 daqiqa oldin").
* Telefon: `+998 90 123 45 67`.
* Davomat holatlari: Keldi (yashil), Kechikdi (sariq), Uzrli (ko'k), Kelmadi (qizil).

## 6. Accessibility
Semantik HTML (`nav`, `main`, `header`, `table`), har input'da `label`, ikon-tugmalarda `aria-label`,
klaviatura bilan to'liq boshqaruv (Tab tartibi, `Esc` modal/drawer yopadi, menyularda strelkalar),
`skip to content` havolasi, rang yagona ma'lumot tashuvchisi emas (matn + ikon).

## 7. Responsive
* `≥ lg`: doimiy sidebar, 4 ustunli KPI setka.
* `md`: 2 ustunli KPI, jadval to'liq.
* `< md`: 1 ustun, sidebar drawer, jadvallar gorizontal scroll, filterlar ustma-ust, modal to'liq ekran (bottom-sheet uslubi).

## 8. Skrinshotlar bilan taqqoslash
Skrinshotlar taqdim etilmagan — taqqoslash bajarilmadi.
