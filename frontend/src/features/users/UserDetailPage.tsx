import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, KeyRound, MessageSquare, Pencil, Unlock, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Button } from "@/components/ui/Button";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  DescriptionList,
  EmptyState,
  ErrorState,
  PageHeader,
  rateTone,
  Spinner,
  StatCard,
} from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/Table";
import { get, post } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { date, daysOfWeek, money, percent, phone, time } from "@/lib/format";
import { useAction, useOptions } from "@/lib/hooks";
import { GROUP_STATUS, MEMBERSHIP_STATUS, ROLE, label, tone } from "@/lib/labels";
import type { AttendanceSummary, Balance, Group, Membership, User } from "@/lib/types";
import { EnrollModal } from "@/features/groups/EnrollModal";

import { TemporaryPasswordModal, UserForm } from "./UserForm";

export default function UserDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const staff = isStaff(me.role);
  const q = useQuery({ queryKey: ["user", id], queryFn: () => get<User>(`/users/${id}/`) });
  const user = q.data;
  const isStudent = user?.role === "student";
  const isTeacher = user?.role === "teacher";

  const memberships = useOptions<Membership>(["memberships", "user", id], "/memberships/", { student: id }, Boolean(isStudent));
  const balances = useOptions<Balance>(["balances", "user", id], "/balances/", { student: id }, Boolean(isStudent && staff));
  const attendance = useQuery({
    queryKey: ["attendance-summary", id],
    queryFn: () => get<AttendanceSummary>("/attendance/summary/", { student: id }),
    enabled: Boolean(isStudent),
  });
  const grades = useQuery({
    queryKey: ["grades-summary", id],
    queryFn: () => get<{ average_percent: number | null; graded_count: number }>("/grades/summary/", { student: id }),
    enabled: Boolean(isStudent),
  });
  const coins = useQuery({
    queryKey: ["reward-balance", id],
    queryFn: () => get<{ balance: number }>("/rewards/balance/", { student: id }),
    enabled: Boolean(isStudent),
  });
  const teacherGroups = useOptions<Group>(["groups", "teacher", id], "/groups/", { teacher: id }, Boolean(isTeacher));

  const [editing, setEditing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const block = useAction((reason: string) => post(`/users/${id}/block/`, { reason }), {
    success: "Foydalanuvchi bloklandi.",
    invalidate: ["user", "users"],
    onSuccess: () => setBlocking(false),
  });
  const unblock = useAction(() => post(`/users/${id}/unblock/`), {
    success: "Foydalanuvchi blokdan chiqarildi.",
    invalidate: ["user", "users"],
  });
  const resetPassword = useAction(() => post<{ temporary_password: string }>(`/users/${id}/set-password/`, {}), {
    onSuccess: (r) => {
      setResetting(false);
      setTempPassword(r.temporary_password);
    },
  });
  const openChat = useAction(() => post<{ id: number }>("/chat/rooms/direct/", { user_id: Number(id) }), {
    onSuccess: (room) => navigate(`/chat?room=${room.id}`),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!user) return <Spinner />;

  const totalDebt = (balances.data ?? []).reduce((s, b) => s + Number(b.debt), 0);
  const back = user.role === "student" ? "/students" : user.role === "teacher" ? "/teachers" : "/admins";

  return (
    <>
      <PageHeader
        back={
          staff && (
            <Link to={back} className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-800">
              <ArrowLeft className="size-3.5" /> Orqaga
            </Link>
          )
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.full_name} src={user.avatar} size="lg" />
            <span>
              {user.full_name}
              <span className="mt-1 flex flex-wrap gap-2">
                <Badge tone={tone(ROLE, user.role)}>{label(ROLE, user.role)}</Badge>
                <Badge tone={user.is_active ? "success" : "danger"}>{user.is_active ? "Faol" : "Bloklangan"}</Badge>
              </span>
            </span>
          </span>
        }
        actions={
          <>
            {user.id !== me.id && (
              <Button variant="secondary" icon={<MessageSquare className="size-4" />} onClick={() => openChat.mutate(undefined)} loading={openChat.isPending}>
                Xabar yozish
              </Button>
            )}
            {staff && (
              <>
                {isStudent && (
                  <Button variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setEnrolling(true)}>
                    Guruhga qo'shish
                  </Button>
                )}
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                  Tahrirlash
                </Button>
                {user.id !== me.id && (
                  <>
                    <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setResetting(true)}>
                      Parolni tiklash
                    </Button>
                    {user.is_active ? (
                      <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setBlocking(true)}>
                        Bloklash
                      </Button>
                    ) : (
                      <Button variant="success" icon={<Unlock className="size-4" />} onClick={() => unblock.mutate(undefined)} loading={unblock.isPending}>
                        Blokdan chiqarish
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </>
        }
      />

      {isStudent && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Davomat" value={percent(attendance.data?.rate)} tone={rateTone(attendance.data?.rate)} loading={attendance.isLoading} hint={attendance.data && `${attendance.data.marked} ta belgilangan dars`} />
          <StatCard label="O'rtacha baho" value={percent(grades.data?.average_percent)} tone="success" loading={grades.isLoading} hint={grades.data && `${grades.data.graded_count} ta baho`} />
          <StatCard label="Coinlar" value={coins.data?.balance ?? "—"} tone="warning" loading={coins.isLoading} />
          {staff && <StatCard label="Qarzdorlik" value={money(totalDebt)} tone={totalDebt > 0 ? "danger" : "success"} loading={balances.isLoading} />}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card className="h-fit">
          <CardHeader title="Ma'lumotlar" />
          <DescriptionList
            className="p-5 sm:grid-cols-1"
            items={[
              ["Telefon", phone(user.phone)],
              ["Email", user.email || "—"],
              ["Filial", user.branch_name ?? "—"],
              ...(isStudent
                ? ([
                    ["Tug'ilgan sana", date(user.profile?.birth_date)],
                    ["Ota-ona", user.profile?.parent_name || "—"],
                    ["Ota-ona telefoni", phone(user.profile?.parent_phone)],
                  ] as [string, string][])
                : []),
              ...(isTeacher ? ([["Mutaxassislik", user.profile?.specialization || "—"]] as [string, string][]) : []),
              ...(staff
                ? ([
                    ["Oxirgi kirish", date(user.last_login)],
                    ["Qo'shilgan", date(user.created_at)],
                    ["Ichki izoh", user.profile?.notes || "—"],
                  ] as [string, string][])
                : []),
            ]}
          />
        </Card>

        <div className="space-y-6">
          {isStudent && (
            <Card>
              <CardHeader title="Guruhlar tarixi" />
              <DataTable
                rows={memberships.data}
                loading={memberships.isLoading}
                error={memberships.error}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/groups/${r.group}`)}
                empty={<EmptyState title="Guruhga a'zo emas" />}
                columns={[
                  {
                    key: "group",
                    header: "Guruh",
                    cell: (r) => (
                      <div>
                        <p className="font-medium text-ink-900">{r.group_name}</p>
                        <p className="text-[13px] text-ink-500">{r.course_name}</p>
                      </div>
                    ),
                  },
                  { key: "period", header: "Davr", cell: (r) => `${date(r.joined_at)} — ${r.left_at ? date(r.left_at) : "hozir"}` },
                  { key: "fee", header: "Oylik", cell: (r) => money(r.monthly_amount), className: "tabular" },
                  { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(MEMBERSHIP_STATUS, r.status)}>{label(MEMBERSHIP_STATUS, r.status)}</Badge> },
                ]}
              />
            </Card>
          )}
          {isStudent && staff && (
            <Card>
              <CardHeader title="Balans" description="Har bir guruh bo'yicha hisoblangan va to'langan summa" />
              <DataTable
                rows={balances.data}
                loading={balances.isLoading}
                error={balances.error}
                rowKey={(r) => r.id}
                columns={[
                  { key: "group", header: "Guruh", cell: (r) => r.group_name },
                  { key: "charged", header: "Hisoblangan", cell: (r) => money(r.charged), className: "tabular" },
                  { key: "paid", header: "To'langan", cell: (r) => money(r.paid), className: "tabular" },
                  {
                    key: "debt",
                    header: "Qarz",
                    cell: (r) => <span className={Number(r.debt) > 0 ? "font-medium text-danger" : "text-success"}>{money(r.debt)}</span>,
                    className: "tabular",
                  },
                ]}
              />
            </Card>
          )}
          {isTeacher && (
            <Card>
              <CardHeader title="Guruhlari" />
              <DataTable
                rows={teacherGroups.data}
                loading={teacherGroups.isLoading}
                error={teacherGroups.error}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/groups/${r.id}`)}
                empty={<EmptyState title="Guruh biriktirilmagan" />}
                columns={[
                  { key: "name", header: "Guruh", cell: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
                  { key: "course", header: "Kurs", cell: (r) => r.course_name },
                  { key: "time", header: "Vaqt", cell: (r) => `${daysOfWeek(r.days_of_week)} ${time(r.lesson_start_time)}` },
                  { key: "students", header: "Studentlar", cell: (r) => r.students_count, className: "tabular" },
                  { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(GROUP_STATUS, r.status)}>{label(GROUP_STATUS, r.status)}</Badge> },
                ]}
              />
            </Card>
          )}
        </div>
      </div>

      {editing && <UserForm role={user.role} user={user} onClose={() => setEditing(false)} />}
      {enrolling && <EnrollModal student={user} onClose={() => setEnrolling(false)} />}
      {tempPassword && <TemporaryPasswordModal password={tempPassword} onClose={() => setTempPassword(null)} />}
      <ConfirmDialog
        open={blocking}
        onClose={() => setBlocking(false)}
        title="Foydalanuvchini bloklash"
        description="Bloklangan foydalanuvchi tizimga kira olmaydi, barcha sessiyalari yopiladi."
        confirmLabel="Bloklash"
        loading={block.isPending}
        onConfirm={(reason) => block.mutate(reason)}
        reason={{ label: "Sabab", placeholder: "Masalan: o'qishni tugatdi" }}
      />
      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Parolni tiklash"
        description="Yangi vaqtinchalik parol yaratiladi va foydalanuvchining barcha sessiyalari yopiladi."
        confirmLabel="Tiklash"
        tone="primary"
        loading={resetPassword.isPending}
        onConfirm={() => resetPassword.mutate(undefined)}
      />
    </>
  );
}
