export type Role = "superadmin" | "admin" | "teacher" | "student";

export interface Profile {
  birth_date: string | null;
  parent_name: string;
  parent_phone: string;
  specialization: string;
  bio: string;
  notes?: string;
}

export interface User {
  id: number;
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  branch: number | null;
  branch_name: string | null;
  avatar: string | null;
  is_active: boolean;
  must_change_password?: boolean;
  deactivated_at?: string | null;
  last_login?: string | null;
  created_at?: string;
  profile?: Profile | null;
  temporary_password?: string | null;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address: string;
  phone: string;
  is_active: boolean;
  students_count: number | null;
  teachers_count: number | null;
  active_groups_count: number | null;
}

export interface Room {
  id: number;
  branch: number;
  branch_name: string;
  name: string;
  capacity: number | null;
  is_active: boolean;
}

export interface Course {
  id: number;
  name: string;
  code: string;
  description: string;
  branch: number | null;
  branch_name: string | null;
  duration_months: number;
  lessons_per_week: number;
  lesson_duration_minutes: number;
  monthly_price: string;
  is_active: boolean;
  groups_count: number;
}

export interface CourseMaterial {
  id: number;
  course: number;
  title: string;
  description: string;
  file_name: string;
  has_file: boolean;
  url: string;
  order: number;
  created_at: string;
}

export type GroupStatus = "forming" | "active" | "completed" | "cancelled";

export interface Group {
  id: number;
  code: string;
  name: string;
  course: number;
  course_name: string;
  branch: number;
  branch_name: string;
  teacher: number | null;
  teacher_name: string | null;
  room: number | null;
  room_name: string | null;
  status: GroupStatus;
  start_date: string;
  end_date: string | null;
  capacity: number;
  days_of_week: number[];
  lesson_start_time: string | null;
  lesson_end_time: string | null;
  students_count: number;
}

export type MembershipStatus = "active" | "frozen" | "completed" | "left" | "transferred";

export interface Membership {
  id: number;
  group: number;
  group_name: string;
  group_code: string;
  course_name: string;
  student: number;
  student_name: string;
  student_phone: string;
  status: MembershipStatus;
  joined_at: string;
  left_at: string | null;
  monthly_fee: string;
  discount_type: "none" | "percent" | "fixed";
  discount_value: string;
  discount_reason?: string;
  monthly_amount: string;
  note?: string;
}

export interface Lesson {
  id: number;
  group: number;
  group_name: string;
  group_code: string;
  course_name: string;
  branch: number;
  branch_name: string;
  teacher: number;
  teacher_name: string;
  room: number | null;
  room_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  topic: string;
  status: "scheduled" | "completed" | "cancelled";
  cancel_reason: string;
  notes: string;
  attendance_marked: boolean;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRecord {
  id: number;
  lesson: number;
  group: number;
  group_name: string;
  date: string;
  start_time: string;
  topic: string;
  student: number;
  student_name: string;
  status: AttendanceStatus;
  comment: string;
  marked_by_name: string | null;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  total_lessons?: number;
  rate: number | null;
}

export interface Assignment {
  id: number;
  group: number;
  group_name: string;
  group_code: string;
  course_name: string;
  lesson: number | null;
  title: string;
  description: string;
  grading_criteria: string;
  max_score: number;
  due_at: string;
  allow_late: boolean;
  has_attachment: boolean;
  attachment_name: string;
  link: string;
  status: "draft" | "published" | "closed";
  published_at: string | null;
  created_by_name: string;
  submissions_count: number | null;
  pending_review_count: number | null;
  my_submission: {
    id?: number;
    status: SubmissionStatus;
    is_late?: boolean;
    last_submitted_at?: string;
    score?: string | null;
  } | null;
}

export type SubmissionStatus = "not_submitted" | "submitted" | "under_review" | "needs_revision" | "graded";

export interface Revision {
  id: number;
  number: number;
  text: string;
  file_name: string;
  file_size: number | null;
  has_file: boolean;
  link: string;
  is_late: boolean;
  submitted_at: string;
}

export interface Submission {
  id: number | null;
  assignment?: number;
  assignment_title?: string;
  max_score?: number;
  group_name?: string;
  student: number;
  student_name: string;
  status: SubmissionStatus;
  revision_count: number;
  last_submitted_at: string | null;
  is_late: boolean;
  feedback?: string;
  grade: { id: number; score: string; max_score: string; comment: string } | null;
  revisions: Revision[];
}

export interface Grade {
  id: number;
  assignment: number;
  assignment_title: string;
  student: number;
  student_name: string;
  group: number;
  group_name: string;
  score: string;
  max_score: string;
  percent: number | null;
  comment: string;
  graded_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: number;
  receipt_number: string;
  membership: number;
  student: number;
  student_name: string;
  group: number;
  group_name: string;
  course_name: string;
  amount: string;
  method: string;
  status: "completed" | "voided";
  paid_at: string;
  note: string;
  received_by_name: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string;
}

export interface Invoice {
  id: number;
  membership: number;
  student: number;
  student_name: string;
  group: number;
  group_name: string;
  period: string;
  base_amount: string;
  discount_amount: string;
  amount: string;
  due_date: string;
  status: "open" | "cancelled";
  paid_amount: string | null;
  payment_state: "paid" | "partial" | "unpaid" | "cancelled" | null;
}

export interface Balance {
  id: number;
  student: number;
  student_name: string;
  student_phone: string;
  group: number;
  group_name: string;
  group_code: string;
  branch_name: string;
  status: MembershipStatus;
  monthly_amount: string;
  charged: string;
  paid: string;
  balance: string;
  debt: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  author_name: string;
  branch: number | null;
  branch_name: string | null;
  group: number | null;
  group_name: string | null;
  audience_roles: Role[];
  is_pinned: boolean;
  status: "draft" | "published";
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ChatRoom {
  id: number;
  kind: "group" | "direct";
  name: string;
  group: number | null;
  other_user: { id: number; full_name: string; role: Role } | null;
  unread_count: number;
  last_message: { body: string; sender_name: string; created_at: string } | null;
  last_message_at: string | null;
}

export interface ChatMessage {
  id: number;
  room: number;
  sender: number;
  sender_name: string;
  sender_role: Role;
  body: string;
  is_deleted: boolean;
  created_at: string;
}

export interface Contact {
  id: number;
  full_name: string;
  role: Role;
  branch_name: string | null;
}

export interface RewardTx {
  id: number;
  student: number;
  student_name: string;
  amount: number;
  category: string;
  reason: string;
  group: number | null;
  group_name: string | null;
  created_by_name: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  actor_name: string | null;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_repr: string;
  changes: Record<string, unknown>;
  branch_name: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemSettings {
  center_name: string;
  currency: string;
  attendance_excused_policy: "exclude" | "present" | "absent";
  attendance_late_counts_present: boolean;
  attendance_edit_window_hours: number;
  max_upload_mb: number;
  allowed_upload_extensions: string;
  invoice_due_day: number;
  payment_void_window_hours: number;
  teacher_reward_limit: number;
  updated_by_name: string | null;
  updated_at: string;
}
