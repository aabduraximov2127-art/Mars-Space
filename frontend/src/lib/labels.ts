/** Uzbek labels + badge tones for every backend enum, in one place. */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

type LabelMap = Record<string, [string, Tone]>;

export const GROUP_STATUS: LabelMap = {
  forming: ["Shakllanmoqda", "info"],
  active: ["Faol", "success"],
  completed: ["Yakunlangan", "neutral"],
  cancelled: ["Bekor qilingan", "danger"],
};

export const MEMBERSHIP_STATUS: LabelMap = {
  active: ["Faol", "success"],
  frozen: ["Muzlatilgan", "warning"],
  completed: ["Bitirgan", "neutral"],
  left: ["Chiqib ketgan", "danger"],
  transferred: ["Ko'chirilgan", "info"],
};

export const LESSON_STATUS: LabelMap = {
  scheduled: ["Rejalashtirilgan", "info"],
  completed: ["O'tilgan", "success"],
  cancelled: ["Bekor qilingan", "danger"],
};

export const ATTENDANCE_STATUS: LabelMap = {
  present: ["Keldi", "success"],
  late: ["Kechikdi", "warning"],
  excused: ["Uzrli", "info"],
  absent: ["Kelmadi", "danger"],
};

export const ASSIGNMENT_STATUS: LabelMap = {
  draft: ["Qoralama", "neutral"],
  published: ["E'lon qilingan", "success"],
  closed: ["Yopilgan", "warning"],
};

export const SUBMISSION_STATUS: LabelMap = {
  not_submitted: ["Topshirilmagan", "neutral"],
  submitted: ["Topshirilgan", "info"],
  under_review: ["Tekshirilmoqda", "brand"],
  needs_revision: ["Qayta ishlash kerak", "warning"],
  graded: ["Baholangan", "success"],
};

export const PAYMENT_METHOD: LabelMap = {
  cash: ["Naqd", "neutral"],
  card: ["Karta", "neutral"],
  transfer: ["Bank o'tkazmasi", "neutral"],
  click: ["Click", "neutral"],
  payme: ["Payme", "neutral"],
  other: ["Boshqa", "neutral"],
};

export const PAYMENT_STATUS: LabelMap = {
  completed: ["Qabul qilingan", "success"],
  voided: ["Bekor qilingan", "danger"],
};

export const INVOICE_STATE: LabelMap = {
  paid: ["To'langan", "success"],
  partial: ["Qisman", "warning"],
  unpaid: ["To'lanmagan", "danger"],
  cancelled: ["Bekor qilingan", "neutral"],
};

export const REWARD_CATEGORY: LabelMap = {
  attendance: ["Davomat", "success"],
  homework: ["Uy vazifasi", "brand"],
  activity: ["Faollik", "info"],
  behavior: ["Xulq", "info"],
  manual: ["Qo'lda", "neutral"],
  redeem: ["Sarflandi", "warning"],
  penalty: ["Jarima", "danger"],
};

export const ROLE: LabelMap = {
  superadmin: ["Superadmin", "brand"],
  admin: ["Admin", "info"],
  teacher: ["Ustoz", "success"],
  student: ["Student", "neutral"],
};

export const AUDIT_ACTION: Record<string, string> = {
  create: "Yaratildi",
  update: "O'zgartirildi",
  delete: "O'chirildi",
  login: "Tizimga kirdi",
  logout: "Tizimdan chiqdi",
  login_failed: "Muvaffaqiyatsiz kirish",
  enroll: "Guruhga qo'shildi",
  transfer: "Ko'chirildi",
  membership_leave: "Guruhdan chiqdi",
  membership_freeze: "Muzlatildi",
  membership_activate: "Faollashtirildi",
  attendance_mark: "Davomat belgilandi",
  payment_create: "To'lov qabul qilindi",
  payment_void: "To'lov bekor qilindi",
  invoices_generate: "Hisoblar yaratildi",
  invoice_cancel: "Hisob bekor qilindi",
  grade: "Baholandi",
  grade_update: "Baho o'zgartirildi",
  submission: "Topshiriq yuborildi",
  assignment_publish: "Vazifa e'lon qilindi",
  assignment_close: "Vazifa yopildi",
  lesson_cancel: "Dars bekor qilindi",
  generate_lessons: "Darslar yaratildi",
  settings_update: "Sozlamalar o'zgardi",
  block: "Bloklandi",
  unblock: "Blokdan chiqarildi",
  password_change: "Parol o'zgartirildi",
  password_reset: "Parol tiklandi",
  password_reset_requested: "Parol tiklash so'raldi",
  password_set_by_admin: "Parol admin tomonidan o'rnatildi",
  role_change: "Rol o'zgartirildi",
  request_revision: "Qayta ishlashga qaytarildi",
  chat_message_delete: "Xabar o'chirildi",
  reward: "Coin berildi",
  payment_reminders: "Eslatmalar yuborildi",
};

export function label(map: LabelMap, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key]?.[0] ?? key;
}

export function tone(map: LabelMap, key: string | null | undefined): Tone {
  if (!key) return "neutral";
  return map[key]?.[1] ?? "neutral";
}
