import { Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Table";
import { DateTimeInput } from "@/components/ui/dates";
import { del, fieldMessage, parseApiError, patch, post } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { dateTime, fromLocalInput, relative, ROLE_LABELS, toLocalInput } from "@/lib/format";
import { useAction, useInvalidate, useOptions, usePagedList } from "@/lib/hooks";
import type { Announcement, Branch, Group, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES: Role[] = ["admin", "teacher", "student"];

function AnnouncementForm({ item, onClose }: { item?: Announcement | null; onClose: () => void }) {
  const me = useMe();
  const invalidate = useInvalidate();
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const [form, setForm] = useState({
    title: item?.title ?? "",
    body: item?.body ?? "",
    branch: item?.branch ? String(item.branch) : "",
    group: item?.group ? String(item.group) : "",
    audience_roles: item?.audience_roles ?? ([] as Role[]),
    is_pinned: item?.is_pinned ?? false,
    status: item?.status ?? "published",
    expires_at: toLocalInput(item?.expires_at),
  });
  const groups = useOptions<Group>(["groups", "announce", form.branch], "/groups/", { branch: form.branch || undefined });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toggleRole = (r: Role) =>
    setForm((f) => ({ ...f, audience_roles: f.audience_roles.includes(r) ? f.audience_roles.filter((x) => x !== r) : [...f.audience_roles, r] }));
  const submit = async () => {
    setSaving(true);
    setErrors({});
    const body = {
      title: form.title,
      body: form.body,
      group: form.group ? Number(form.group) : null,
      audience_roles: form.audience_roles,
      is_pinned: form.is_pinned,
      status: form.status,
      expires_at: form.expires_at ? fromLocalInput(form.expires_at) : null,
      ...(me.role === "superadmin" ? { branch: form.branch ? Number(form.branch) : null } : {}),
    };
    try {
      if (item) await patch(`/announcements/${item.id}/`, body);
      else await post("/announcements/", body);
      toast.success(form.status === "published" ? "E'lon chop etildi." : "Qoralama saqlandi.");
      await invalidate("announcements", "notifications");
      onClose();
    } catch (err) {
      const info = parseApiError(err);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(info.errors)) next[k] = fieldMessage(v) ?? "";
      setErrors(next);
      if (!Object.keys(next).length || info.code !== "validation_error") toast.error(info.detail);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item ? "E'lonni tahrirlash" : "Yangi e'lon"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={saving} disabled={!form.title || !form.body} onClick={submit}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sarlavha" error={errors.title} required className="sm:col-span-2">
          {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
        </Field>
        <Field label="Matn" error={errors.body} required className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
        </Field>
        {me.role === "superadmin" && (
          <Field label="Filial" error={errors.branch} hint="Bo'sh — barcha filiallar">
            {(p) => (
              <Select {...p} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value, group: "" })}>
                <option value="">Barcha filiallar</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Guruh" error={errors.group} hint="Bo'sh — barcha guruhlar">
          {(p) => (
            <Select {...p} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
              <option value="">Barcha guruhlar</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium text-ink-700">Kimlar uchun (hech biri tanlanmasa — hamma)</p>
          <div className="flex flex-wrap gap-4">
            {ROLES.map((r) => (
              <Checkbox key={r} label={ROLE_LABELS[r]} checked={form.audience_roles.includes(r)} onChange={() => toggleRole(r)} />
            ))}
          </div>
        </div>
        <Field label="Amal qilish muddati" error={errors.expires_at}>
          {(p) => <DateTimeInput {...p} value={form.expires_at} onChange={(v) => setForm({ ...form, expires_at: v })} />}
        </Field>
        <Field label="Holat">
          {(p) => (
            <Select {...p} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "draft" | "published" })}>
              <option value="published">Chop etish</option>
              <option value="draft">Qoralama</option>
            </Select>
          )}
        </Field>
        <Checkbox label="Tepaga qadash" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />
      </div>
    </Modal>
  );
}

export default function AnnouncementsPage() {
  const me = useMe();
  const { id } = useParams();
  const staff = isStaff(me.role);
  const list = usePagedList<Announcement>("announcements", "/announcements/", {}, 10);
  const [editing, setEditing] = useState<Announcement | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const remove = useAction((aid: number) => del(`/announcements/${aid}/`), {
    success: "E'lon o'chirildi.",
    invalidate: ["announcements"],
    onSuccess: () => setDeleting(null),
  });
  const canEdit = (a: Announcement) => me.role === "superadmin" || (me.role === "admin" && a.branch === me.branch);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="E'lonlar"
        actions={
          staff && (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
              E'lon yaratish
            </Button>
          )
        }
      />
      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : list.rows?.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="E'lonlar yo'q" />
        </Card>
      ) : (
        <div className="space-y-4">
          {list.rows?.map((a) => (
            <Card key={a.id} className={cn("p-5", String(a.id) === id && "ring-2 ring-brand-300", a.is_pinned && "border-brand-200")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {a.is_pinned && (
                      <Badge tone="brand">
                        <Pin className="size-3" aria-hidden /> Qadalgan
                      </Badge>
                    )}
                    {a.status === "draft" && <Badge tone="neutral">Qoralama</Badge>}
                    <Badge tone="info" dot={false}>
                      {a.group_name ?? a.branch_name ?? "Barcha filiallar"}
                    </Badge>
                    {a.audience_roles.length > 0 && (
                      <Badge tone="neutral" dot={false}>
                        {a.audience_roles.map((r) => ROLE_LABELS[r]).join(", ")}
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-ink-900">{a.title}</h2>
                  <p className="text-[13px] text-ink-500" title={dateTime(a.published_at ?? a.created_at)}>
                    {a.author_name} · {relative(a.published_at ?? a.created_at)}
                  </p>
                </div>
                {canEdit(a) && (
                  <div className="flex shrink-0 gap-1">
                    <IconButton label="Tahrirlash" onClick={() => setEditing(a)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="O'chirish" onClick={() => setDeleting(a)} className="hover:text-danger">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                )}
              </div>
              <p className="mt-3 whitespace-pre-line text-ink-700">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      {editing !== undefined && <AnnouncementForm item={editing} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="E'lonni o'chirish"
        description={deleting?.title}
        confirmLabel="O'chirish"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
