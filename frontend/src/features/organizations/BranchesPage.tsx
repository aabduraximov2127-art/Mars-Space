import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, Input, SearchInput } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { patch, post } from "@/lib/api";
import { phone } from "@/lib/format";
import { applyApiErrors, useInvalidate, usePagedList } from "@/lib/hooks";
import type { Branch } from "@/lib/types";

type Values = { name: string; code: string; address: string; phone: string; is_active: boolean };

function BranchForm({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: branch
      ? { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone, is_active: branch.is_active }
      : { name: "", code: "", address: "", phone: "", is_active: true },
  });
  const submit = handleSubmit(async (v) => {
    try {
      if (branch) await patch(`/branches/${branch.id}/`, v);
      else await post("/branches/", v);
      toast.success(branch ? "Filial saqlandi." : "Filial yaratildi.");
      await invalidate("branches");
      onClose();
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={branch ? "Filialni tahrirlash" : "Yangi filial"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={isSubmitting}>
            Saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nomi" error={errors.name?.message} required className="sm:col-span-2">
          {(p) => <Input {...p} {...register("name", { required: "Nomi majburiy." })} />}
        </Field>
        <Field label="Kodi" error={errors.code?.message} hint="Masalan: CHL" required>
          {(p) => <Input {...p} {...register("code", { required: "Kod majburiy." })} className="uppercase" />}
        </Field>
        <Field label="Telefon" error={errors.phone?.message}>
          {(p) => <Input {...p} {...register("phone")} placeholder="+998..." />}
        </Field>
        <Field label="Manzil" error={errors.address?.message} className="sm:col-span-2">
          {(p) => <Input {...p} {...register("address")} />}
        </Field>
        <Checkbox label="Faol" {...register("is_active")} />
      </form>
    </Modal>
  );
}

export default function BranchesPage() {
  const list = usePagedList<Branch>("branches", "/branches/");
  const [editing, setEditing] = useState<Branch | null | undefined>(undefined);
  return (
    <>
      <PageHeader
        title="Filiallar"
        description="O'quv markazi filiallari. Filial o'chirilmaydi — nofaol qilinadi."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
            Filial qo'shish
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} />
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "name",
              header: "Filial",
              cell: (r) => (
                <div>
                  <p className="font-medium text-ink-900">{r.name}</p>
                  <p className="text-[13px] text-ink-500">{r.address || "—"}</p>
                </div>
              ),
            },
            { key: "code", header: "Kod", cell: (r) => <code className="font-mono text-[13px]">{r.code}</code> },
            { key: "phone", header: "Telefon", cell: (r) => phone(r.phone) },
            { key: "students", header: "Studentlar", cell: (r) => r.students_count ?? "—", className: "tabular" },
            { key: "teachers", header: "Ustozlar", cell: (r) => r.teachers_count ?? "—", className: "tabular" },
            { key: "groups", header: "Faol guruhlar", cell: (r) => r.active_groups_count ?? "—", className: "tabular" },
            {
              key: "status",
              header: "Holat",
              cell: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Faol" : "Nofaol"}</Badge>,
            },
            {
              key: "actions",
              header: "",
              cell: (r) => (
                <IconButton label="Tahrirlash" onClick={() => setEditing(r)}>
                  <Pencil className="size-4" />
                </IconButton>
              ),
              className: "text-right",
            },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {editing !== undefined && <BranchForm branch={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}
