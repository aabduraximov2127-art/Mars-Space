import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ExternalLink, FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, CardHeader, DescriptionList, EmptyState, ErrorState, PageHeader, Skeleton, Spinner } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { del, downloadFile, get, parseApiError, post, toFormData } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { useAction, useInvalidate } from "@/lib/hooks";
import type { Course, CourseMaterial } from "@/lib/types";

import { CourseForm } from "./CourseForm";

function MaterialModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await post(`/courses/${course.id}/materials/`, toFormData({ title, description, url, file }));
      toast.success("Material qo'shildi.");
      await invalidate("materials");
      onClose();
    } catch (err) {
      toast.error(parseApiError(err).detail);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Material qo'shish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={saving} disabled={!title || (!file && !url)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Sarlavha" required>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Tavsif">
          {(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Fayl" hint="Fayl yoki havoladan kamida bittasi">
          {(p) => <Input {...p} type="file" className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="Havola">
          {(p) => <Input {...p} type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const q = useQuery({ queryKey: ["course", id], queryFn: () => get<Course>(`/courses/${id}/`) });
  const materials = useQuery({ queryKey: ["materials", id], queryFn: () => get<CourseMaterial[]>(`/courses/${id}/materials/`) });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CourseMaterial | null>(null);
  const remove = useAction((mid: number) => del(`/course-materials/${mid}/`), {
    success: "Material o'chirildi.",
    invalidate: ["materials"],
    onSuccess: () => setDeleting(null),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c) return <Spinner />;
  const canManage = me.role === "superadmin" || (me.role === "admin" && c.branch === me.branch);

  return (
    <>
      <PageHeader
        back={
          <Link to="/courses" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-800">
            <ArrowLeft className="size-3.5" /> Kurslar
          </Link>
        }
        title={c.name}
        description={c.code}
        actions={
          canManage && (
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              Tahrirlash
            </Button>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <Card className="h-fit p-5">
          <p className="whitespace-pre-line text-ink-700">{c.description || "Tavsif kiritilmagan."}</p>
          <DescriptionList
            className="mt-5 border-t border-line pt-5"
            items={[
              ["Oylik narx", money(c.monthly_price)],
              ["Davomiyligi", `${c.duration_months} oy`],
              ["Haftada", `${c.lessons_per_week} dars`],
              ["Dars", `${c.lesson_duration_minutes} daqiqa`],
              ["Filial", c.branch_name ?? "Umumiy"],
              ["Holat", <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? "Faol" : "Nofaol"}</Badge>],
            ]}
          />
        </Card>
        <Card>
          <CardHeader
            title="O'quv materiallari"
            actions={
              canManage && (
                <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  Qo'shish
                </Button>
              )
            }
          />
          {materials.error ? (
            <ErrorState error={materials.error} onRetry={() => materials.refetch()} />
          ) : materials.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : !materials.data?.length ? (
            <EmptyState icon={FileText} title="Materiallar hali yo'q" />
          ) : (
            <ul className="divide-y divide-line">
              {materials.data.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{m.title}</p>
                    {m.description && <p className="text-[13px] text-ink-500">{m.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-3 text-[13px]">
                      {m.has_file && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                          onClick={() => downloadFile(`/course-materials/${m.id}/download/`, m.file_name).catch((e) => toast.error(parseApiError(e).detail))}
                        >
                          <Paperclip className="size-3.5" /> {m.file_name || "Fayl"} <Download className="size-3.5" />
                        </button>
                      )}
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                          Havola <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      <span className="text-ink-400">{date(m.created_at)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <IconButton label="O'chirish" onClick={() => setDeleting(m)} className="hover:text-danger">
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <CourseForm course={c} onClose={() => setEditing(false)} />}
      {adding && <MaterialModal course={c} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Materialni o'chirish"
        description={deleting?.title}
        confirmLabel="O'chirish"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
