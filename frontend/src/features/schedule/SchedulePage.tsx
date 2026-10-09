import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Badge, Card, DescriptionList, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { get, parseApiError, patch, post } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { addDays, date, startOfWeek, time, today, WEEKDAYS } from "@/lib/format";
import { useAction, useInvalidate, useOptions } from "@/lib/hooks";
import { LESSON_STATUS, label, tone } from "@/lib/labels";
import type { Branch, Group, Lesson, Room, User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Conflict {
  type: string;
  message: string;
}

function LessonCreateModal({ onClose, defaultDate }: { onClose: () => void; defaultDate: string }) {
  const invalidate = useInvalidate();
  const groups = useOptions<Group>(["groups", "schedule-options"], "/groups/", {});
  const [form, setForm] = useState({ group: "", date: defaultDate, start_time: "14:00", end_time: "15:30", room: "", topic: "" });
  const group = groups.data?.find((g) => String(g.id) === form.group);
  const rooms = useOptions<Room>(["rooms", "options", group?.branch], "/rooms/", { branch: group?.branch, is_active: true }, Boolean(group));
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [saving, setSaving] = useState(false);
  const pickGroup = (id: string) => {
    const g = groups.data?.find((x) => String(x.id) === id);
    setForm({
      ...form,
      group: id,
      start_time: g?.lesson_start_time?.slice(0, 5) ?? form.start_time,
      end_time: g?.lesson_end_time?.slice(0, 5) ?? form.end_time,
      room: g?.room ? String(g.room) : "",
    });
  };
  const submit = async () => {
    setSaving(true);
    setConflicts([]);
    try {
      await post("/lessons/", {
        group: Number(form.group),
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        room: form.room ? Number(form.room) : null,
        topic: form.topic,
      });
      toast.success("Dars qo'shildi.");
      await invalidate("lessons");
      onClose();
    } catch (err) {
      const info = parseApiError(err);
      if (Array.isArray(info.data.conflicts)) setConflicts(info.data.conflicts as Conflict[]);
      else toast.error(info.detail);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Dars qo'shish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={saving} disabled={!form.group}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guruh" required className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={form.group} onChange={(e) => pickGroup(e.target.value)}>
              <option value="">Tanlang</option>
              {groups.data
                ?.filter((g) => ["active", "forming"].includes(g.status))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code}) — {g.teacher_name ?? "ustozsiz"}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Sana" required>
          {(p) => <Input {...p} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
        </Field>
        <Field label="Xona">
          {(p) => (
            <Select {...p} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} disabled={!group}>
              <option value="">Tanlanmagan</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Boshlanish" required>
          {(p) => <Input {...p} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />}
        </Field>
        <Field label="Tugash" required>
          {(p) => <Input {...p} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />}
        </Field>
        <Field label="Mavzu" className="sm:col-span-2">
          {(p) => <Input {...p} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />}
        </Field>
      </div>
      {conflicts.length > 0 && (
        <div role="alert" className="mt-4 rounded-md border border-danger/20 bg-danger-soft p-3 text-[13px] text-rose-800">
          <p className="mb-1 font-semibold">Jadvalda to'qnashuv bor:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {conflicts.map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function LessonModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const me = useMe();
  const staff = isStaff(me.role);
  const canEditTopic = staff || (me.role === "teacher" && lesson.teacher === me.id);
  const [topic, setTopic] = useState(lesson.topic);
  const [notes, setNotes] = useState(lesson.notes);
  const [cancelling, setCancelling] = useState(false);
  const save = useAction(() => patch(`/lessons/${lesson.id}/`, { topic, notes }), {
    success: "Saqlandi.",
    invalidate: ["lessons"],
    onSuccess: onClose,
  });
  const cancel = useAction((reason: string) => post(`/lessons/${lesson.id}/cancel/`, { reason }), {
    success: "Dars bekor qilindi.",
    invalidate: ["lessons"],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={lesson.group_name}
      description={`${date(lesson.date)} · ${time(lesson.start_time)}–${time(lesson.end_time)}`}
      footer={
        <>
          {staff && lesson.status === "scheduled" && (
            <Button variant="danger" className="mr-auto" onClick={() => setCancelling(true)}>
              Darsni bekor qilish
            </Button>
          )}
          {me.role !== "student" && lesson.status !== "cancelled" && lesson.date <= today() && (
            <Link to={`/attendance/lesson/${lesson.id}`}>
              <Button variant="secondary">Davomat</Button>
            </Link>
          )}
          {canEditTopic && (
            <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
              Saqlash
            </Button>
          )}
        </>
      }
    >
      <DescriptionList
        items={[
          ["Guruh", <Link to={`/groups/${lesson.group}`} className="text-brand-700 hover:underline">{lesson.group_name} ({lesson.group_code})</Link>],
          ["Kurs", lesson.course_name],
          ["Ustoz", lesson.teacher_name],
          ["Xona", lesson.room_name ?? "—"],
          ["Holat", <Badge tone={tone(LESSON_STATUS, lesson.status)}>{label(LESSON_STATUS, lesson.status)}</Badge>],
          ["Davomat", lesson.attendance_marked ? "Belgilangan" : "Belgilanmagan"],
        ]}
      />
      {lesson.status === "cancelled" && (
        <p className="mt-4 rounded-md bg-danger-soft p-3 text-[13px] text-rose-800">Bekor qilingan: {lesson.cancel_reason}</p>
      )}
      {canEditTopic ? (
        <div className="mt-5 space-y-4">
          <Field label="Mavzu">{(p) => <Input {...p} value={topic} onChange={(e) => setTopic(e.target.value)} />}</Field>
          <Field label="Izoh">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      ) : (
        lesson.topic && <p className="mt-5 text-ink-700"><span className="font-medium">Mavzu:</span> {lesson.topic}</p>
      )}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Darsni bekor qilish"
        description="Studentlar va ustozga bildirishnoma yuboriladi."
        confirmLabel="Bekor qilish"
        loading={cancel.isPending}
        reason={{ label: "Sabab" }}
        onConfirm={(r) => cancel.mutate(r)}
      />
    </Modal>
  );
}

const COLORS = [
  "border-l-brand-500 bg-brand-50/60",
  "border-l-sky-500 bg-sky-50/70",
  "border-l-emerald-500 bg-emerald-50/70",
  "border-l-amber-500 bg-amber-50/70",
  "border-l-rose-500 bg-rose-50/70",
  "border-l-violet-500 bg-violet-50/70",
];

export default function SchedulePage() {
  const me = useMe();
  const staff = isStaff(me.role);
  const [week, setWeek] = useState(startOfWeek(today()));
  const [filters, setFilters] = useState({ group: "", teacher: "", branch: "" });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const end = addDays(week, 6);
  const groups = useOptions<Group>(["groups", "schedule-filter"], "/groups/", {});
  const teachers = useOptions<User>(["users", "teachers-filter"], "/users/", { role: "teacher" }, staff);
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const q = useQuery({
    queryKey: ["lessons", "week", week, filters],
    queryFn: () => get<{ results: Lesson[] }>("/lessons/", { date_from: week, date_to: end, page_size: 100, ...filters }),
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byDay = (d: string) => (q.data?.results ?? []).filter((l) => l.date === d);
  const colorOf = (groupId: number) => COLORS[groupId % COLORS.length];

  return (
    <>
      <PageHeader
        title="Dars jadvali"
        actions={
          staff && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Dars qo'shish
            </Button>
          )
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Oldingi hafta">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeek(startOfWeek(today()))}>
            Bu hafta
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Keyingi hafta">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="font-medium text-ink-900">
          {date(week)} — {date(end)}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {me.role !== "student" && (
            <Select className="h-9 w-48" aria-label="Guruh" value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
              <option value="">Barcha guruhlar</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
          {staff && (
            <Select className="h-9 w-48" aria-label="Ustoz" value={filters.teacher} onChange={(e) => setFilters({ ...filters, teacher: e.target.value })}>
              <option value="">Barcha ustozlar</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </Select>
          )}
          {me.role === "superadmin" && (
            <Select className="h-9 w-44" aria-label="Filial" value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
              <option value="">Barcha filiallar</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d, i) => {
            const lessons = byDay(d);
            const isToday = d === today();
            return (
              <section key={d} className={cn("min-h-32 rounded-lg border bg-surface", isToday ? "border-brand-300 ring-2 ring-brand-100" : "border-line")} aria-label={`${WEEKDAYS[i]}, ${date(d)}`}>
                <header className={cn("border-b px-3 py-2", isToday ? "border-brand-200 bg-brand-50" : "border-line")}>
                  <p className={cn("text-[13px] font-semibold", isToday ? "text-brand-700" : "text-ink-800")}>{WEEKDAYS[i]}</p>
                  <p className="text-xs text-ink-500">{date(d)}</p>
                </header>
                <div className="space-y-2 p-2">
                  {q.isLoading ? (
                    <Skeleton className="h-16" />
                  ) : lessons.length === 0 ? (
                    <p className="py-3 text-center text-xs text-ink-400">Dars yo'q</p>
                  ) : (
                    lessons.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelected(l)}
                        className={cn(
                          "w-full rounded-md border-l-[3px] px-2.5 py-2 text-left transition-shadow hover:shadow-pop",
                          colorOf(l.group),
                          l.status === "cancelled" && "opacity-60 line-through",
                        )}
                      >
                        <p className="flex items-center gap-1 text-xs font-semibold text-ink-700">
                          <Clock className="size-3" aria-hidden /> {time(l.start_time)}–{time(l.end_time)}
                        </p>
                        <p className="mt-0.5 text-[13px] leading-snug font-medium text-ink-900">{l.group_name}</p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                          {me.role === "teacher" ? <MapPin className="size-3 shrink-0" aria-hidden /> : <UserIcon className="size-3 shrink-0" aria-hidden />}
                          {me.role === "teacher" ? l.room_name ?? "—" : l.teacher_name}
                        </p>
                        {l.attendance_marked && <p className="mt-1 text-[11px] font-medium text-success">✓ Davomat</p>}
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {creating && <LessonCreateModal onClose={() => setCreating(false)} defaultDate={today() >= week && today() <= end ? today() : week} />}
      {selected && <LessonModal lesson={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
