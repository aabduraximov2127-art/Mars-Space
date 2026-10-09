import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, ExternalLink, Lock, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, DescriptionList, EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/Table";
import { del, downloadFile, get, parseApiError, post, toFormData } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { dateTime, fileSize } from "@/lib/format";
import { useAction, useInvalidate } from "@/lib/hooks";
import { ASSIGNMENT_STATUS, SUBMISSION_STATUS, label, tone } from "@/lib/labels";
import type { Assignment, Revision, Submission } from "@/lib/types";

import { AssignmentForm } from "./AssignmentForm";

const download = (url: string, name: string) => downloadFile(url, name).catch((e) => toast.error(parseApiError(e).detail));

function RevisionView({ submissionId, r }: { submissionId: number; r: Revision }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="font-medium text-ink-800">Versiya {r.number}</span>
        <span className="flex items-center gap-2 text-ink-500">
          {r.is_late && <Badge tone="warning">Kechikkan</Badge>}
          {dateTime(r.submitted_at)}
        </span>
      </div>
      {r.text && <p className="mt-2 whitespace-pre-line text-ink-700">{r.text}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
        {r.has_file && (
          <button type="button" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" onClick={() => download(`/submissions/${submissionId}/revisions/${r.number}/file/`, r.file_name)}>
            <Download className="size-3.5" /> {r.file_name} {r.file_size ? `(${fileSize(r.file_size)})` : ""}
          </button>
        )}
        {r.link && (
          <a href={r.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium break-all text-brand-700 hover:underline">
            {r.link} <ExternalLink className="size-3.5 shrink-0" />
          </a>
        )}
      </div>
    </div>
  );
}

function ReviewModal({ s, maxScore, onClose }: { s: Submission; maxScore: number; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [score, setScore] = useState(s.grade ? String(Number(s.grade.score)) : "");
  const [comment, setComment] = useState(s.grade?.comment ?? "");
  const [feedback, setFeedback] = useState("");
  const refresh = () => invalidate("submissions", "assignments", "assignment", "dashboard", "gradebook");
  const grade = useAction(() => post(`/submissions/${s.id}/grade/`, { score, comment }), {
    success: "Baho qo'yildi.",
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const revise = useAction(() => post(`/submissions/${s.id}/request-revision/`, { feedback }), {
    success: "Qayta ishlashga qaytarildi.",
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const startReview = useAction(() => post(`/submissions/${s.id}/start-review/`), {
    onSuccess: refresh,
  });
  const valid = score !== "" && Number(score) >= 0 && Number(score) <= maxScore;
  return (
    <Modal open onClose={onClose} title={s.student_name} description={`${s.revision_count} ta versiya · ${label(SUBMISSION_STATUS, s.status)}`} size="lg">
      <div className="space-y-3">
        {s.revisions.map((r) => (
          <RevisionView key={r.id} submissionId={s.id!} r={r} />
        ))}
      </div>
      {s.status === "submitted" && (
        <Button variant="secondary" size="sm" className="mt-3" loading={startReview.isPending} onClick={() => startReview.mutate(undefined)}>
          Tekshirishni boshlash
        </Button>
      )}
      <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-[160px_1fr]">
        <Field label={`Ball (0–${maxScore})`} required error={score !== "" && !valid ? "Noto'g'ri ball." : undefined}>
          {(p) => <Input {...p} type="number" min={0} max={maxScore} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />}
        </Field>
        <Field label="Izoh">
          {(p) => <Textarea {...p} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button loading={grade.isPending} disabled={!valid} onClick={() => grade.mutate(undefined)}>
            {s.grade ? "Bahoni yangilash" : "Baholash"}
          </Button>
        </div>
      </div>
      {s.status !== "graded" && (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <Field label="Qayta ishlash uchun izoh">
            {(p) => <Textarea {...p} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Nimani tuzatish kerak?" />}
          </Field>
          <div className="flex justify-end">
            <Button variant="secondary" loading={revise.isPending} disabled={!feedback.trim()} onClick={() => revise.mutate(undefined)}>
              Qayta ishlashga qaytarish
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SubmissionsCard({ a }: { a: Assignment }) {
  const me = useMe();
  const q = useQuery({ queryKey: ["submissions", "assignment", a.id], queryFn: () => get<Submission[]>(`/assignments/${a.id}/submissions/`) });
  const [reviewing, setReviewing] = useState<Submission | null>(null);
  const canReview = me.role === "teacher";
  const counts = (q.data ?? []).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  return (
    <Card>
      <CardHeader
        title="Topshiriqlar"
        description={Object.entries(counts)
          .map(([k, v]) => `${label(SUBMISSION_STATUS, k)}: ${v}`)
          .join(" · ")}
      />
      <DataTable
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.id ?? `n-${r.student}`}
        onRowClick={(r) => r.id && setReviewing(r)}
        empty={<EmptyState title="Guruhda faol student yo'q" />}
        columns={[
          { key: "student", header: "Student", cell: (r) => <span className="font-medium text-ink-900">{r.student_name}</span> },
          {
            key: "status",
            header: "Holat",
            cell: (r) => (
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={tone(SUBMISSION_STATUS, r.status)}>{label(SUBMISSION_STATUS, r.status)}</Badge>
                {r.is_late && <Badge tone="warning">Kechikkan</Badge>}
              </div>
            ),
          },
          { key: "when", header: "Yuborilgan", cell: (r) => (r.last_submitted_at ? dateTime(r.last_submitted_at) : "—") },
          { key: "rev", header: "Versiya", cell: (r) => r.revision_count || "—", className: "tabular" },
          {
            key: "score",
            header: "Ball",
            cell: (r) => (r.grade ? <span className="tabular font-semibold text-ink-900">{Number(r.grade.score)} / {Number(r.grade.max_score)}</span> : "—"),
          },
          {
            key: "act",
            header: "",
            className: "text-right",
            cell: (r) =>
              r.id && (
                <span className="text-[13px] font-medium whitespace-nowrap text-brand-700">
                  {canReview ? (r.status === "graded" ? "Ko'rish" : "Tekshirish") : "Ko'rish"} →
                </span>
              ),
          },
        ]}
      />
      {reviewing &&
        (canReview ? (
          <ReviewModal s={reviewing} maxScore={a.max_score} onClose={() => setReviewing(null)} />
        ) : (
          <Modal open onClose={() => setReviewing(null)} title={reviewing.student_name} size="lg">
            <div className="space-y-3">
              {reviewing.revisions.map((r) => (
                <RevisionView key={r.id} submissionId={reviewing.id!} r={r} />
              ))}
            </div>
          </Modal>
        ))}
    </Card>
  );
}

function MySubmissionCard({ a }: { a: Assignment }) {
  const invalidate = useInvalidate();
  const mineId = a.my_submission?.id;
  const q = useQuery({
    queryKey: ["submissions", "mine", mineId],
    queryFn: () => get<Submission>(`/submissions/${mineId}/`),
    enabled: Boolean(mineId),
  });
  const s = q.data;
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const status = a.my_submission?.status ?? "not_submitted";
  const [now] = useState(() => Date.now());
  const overdue = new Date(a.due_at).getTime() < now;
  const canSubmit =
    a.status === "published" && ["not_submitted", "submitted", "needs_revision"].includes(status) && (!overdue || a.allow_late);

  const submit = async () => {
    setSending(true);
    try {
      await post("/submissions/", toFormData({ assignment: a.id, text, link, file: file ?? undefined }));
      toast.success("Ish yuborildi.");
      setText("");
      setLink("");
      setFile(null);
      await invalidate("assignment", "assignments", "submissions", "dashboard");
    } catch (err) {
      toast.error(parseApiError(err).detail);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Mening ishim" actions={<Badge tone={tone(SUBMISSION_STATUS, status)}>{label(SUBMISSION_STATUS, status)}</Badge>} />
      <div className="space-y-4 p-5">
        {s?.grade && (
          <div className="rounded-lg border border-success/20 bg-success-soft p-4">
            <p className="text-[13px] text-emerald-700">Baho</p>
            <p className="tabular text-2xl font-semibold text-emerald-800">
              {Number(s.grade.score)} / {Number(s.grade.max_score)}
            </p>
            {s.grade.comment && <p className="mt-1 text-emerald-800">{s.grade.comment}</p>}
          </div>
        )}
        {s?.status === "needs_revision" && s.feedback && (
          <div className="rounded-lg border border-warning/30 bg-warning-soft p-4 text-amber-900">
            <p className="font-medium">Ustoz izohi:</p>
            <p className="mt-1 whitespace-pre-line">{s.feedback}</p>
          </div>
        )}
        {s?.revisions.map((r) => (
          <RevisionView key={r.id} submissionId={s.id!} r={r} />
        ))}
        {canSubmit ? (
          <div className="space-y-3 border-t border-line pt-4">
            <p className="font-medium text-ink-900">{status === "not_submitted" ? "Ishni yuborish" : "Yangi versiya yuborish"}</p>
            {overdue && <p className="text-[13px] text-warning">Muddat o'tgan — ish «kechikkan» deb belgilanadi.</p>}
            <Field label="Javob matni">{(p) => <Textarea {...p} rows={4} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fayl">{(p) => <Input {...p} type="file" className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
              <Field label="Havola (GitHub va h.k.)">{(p) => <Input {...p} type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />}</Field>
            </div>
            <Button icon={<Send className="size-4" />} loading={sending} disabled={!text.trim() && !link && !file} onClick={submit}>
              Yuborish
            </Button>
          </div>
        ) : (
          status !== "graded" && (
            <p className="flex items-center gap-2 text-[13px] text-ink-500">
              <Lock className="size-4" aria-hidden />
              {a.status === "closed"
                ? "Vazifa yopilgan."
                : status === "under_review"
                  ? "Ishingiz tekshirilmoqda."
                  : overdue && !a.allow_late
                    ? "Muddat tugagan."
                    : "Hozircha yuborib bo'lmaydi."}
            </p>
          )
        )}
      </div>
    </Card>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["assignment", id], queryFn: () => get<Assignment>(`/assignments/${id}/`) });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const publish = useAction(() => post(`/assignments/${id}/publish/`), { success: "E'lon qilindi.", invalidate: ["assignment", "assignments"] });
  const close = useAction(() => post(`/assignments/${id}/close/`), { success: "Vazifa yopildi.", invalidate: ["assignment", "assignments"] });
  const remove = useAction(() => del(`/assignments/${id}/`), {
    success: "Vazifa o'chirildi.",
    invalidate: ["assignments"],
    onSuccess: () => navigate("/assignments", { replace: true }),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  if (!a) return <Spinner />;
  const manage = me.role !== "student";

  return (
    <>
      <PageHeader
        back={
          <Link to="/assignments" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-800">
            <ArrowLeft className="size-3.5" /> Vazifalar
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.title}
            <Badge tone={tone(ASSIGNMENT_STATUS, a.status)}>{label(ASSIGNMENT_STATUS, a.status)}</Badge>
          </span>
        }
        description={`${a.group_name} · ${a.course_name}`}
        actions={
          manage && (
            <>
              {a.status === "draft" && (
                <Button onClick={() => publish.mutate(undefined)} loading={publish.isPending}>
                  E'lon qilish
                </Button>
              )}
              {a.status === "published" && (
                <Button variant="secondary" onClick={() => close.mutate(undefined)} loading={close.isPending}>
                  Yopish
                </Button>
              )}
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Tahrirlash
              </Button>
              {!a.submissions_count && (
                <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
                  O'chirish
                </Button>
              )}
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card className="h-fit p-5">
          <p className="whitespace-pre-line text-ink-800">{a.description}</p>
          {a.grading_criteria && (
            <div className="mt-4 rounded-md bg-ink-50 p-3 text-[13px] text-ink-600">
              <span className="font-medium text-ink-800">Baholash mezoni: </span>
              {a.grading_criteria}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
            {a.has_attachment && (
              <button type="button" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline" onClick={() => download(`/assignments/${a.id}/attachment/`, a.attachment_name)}>
                <Download className="size-3.5" /> {a.attachment_name || "Fayl"}
              </button>
            )}
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                Havola <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          <DescriptionList
            className="mt-5 border-t border-line pt-5"
            items={[
              ["Muddat", dateTime(a.due_at)],
              ["Maksimal ball", a.max_score],
              ["Kechikib topshirish", a.allow_late ? "Ruxsat" : "Ruxsat yo'q"],
              ["Muallif", a.created_by_name],
              ["E'lon qilingan", dateTime(a.published_at)],
            ]}
          />
        </Card>
        {manage ? <SubmissionsCard a={a} /> : <MySubmissionCard a={a} />}
      </div>
      {editing && <AssignmentForm assignment={a} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Vazifani o'chirish"
        description={a.title}
        confirmLabel="O'chirish"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </>
  );
}
