import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, Input, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { del, patch, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { applyApiErrors, useAction, useInvalidate, useOptions, usePagedList } from "@/lib/hooks";
import type { Branch, Room } from "@/lib/types";

type Values = { name: string; capacity: string; branch: string; is_active: boolean };

function RoomForm({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const me = useMe();
  const invalidate = useInvalidate();
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: room?.name ?? "",
      capacity: room?.capacity ? String(room.capacity) : "",
      branch: room ? String(room.branch) : "",
      is_active: room?.is_active ?? true,
    },
  });
  const submit = handleSubmit(async (v) => {
    const body = {
      name: v.name,
      capacity: v.capacity ? Number(v.capacity) : null,
      is_active: v.is_active,
      ...(me.role === "superadmin" && v.branch ? { branch: Number(v.branch) } : {}),
    };
    try {
      if (room) await patch(`/rooms/${room.id}/`, body);
      else await post("/rooms/", body);
      toast.success("Xona saqlandi.");
      await invalidate("rooms");
      onClose();
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={room ? "Xonani tahrirlash" : "Yangi xona"}
      size="sm"
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
      <form onSubmit={submit} className="space-y-4">
        {me.role === "superadmin" && (
          <Field label="Filial" error={errors.branch?.message} required>
            {(p) => (
              <Select {...p} {...register("branch", { required: "Filialni tanlang." })}>
                <option value="">Tanlang</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Nomi" error={errors.name?.message} required>
          {(p) => <Input {...p} {...register("name", { required: "Nomi majburiy." })} />}
        </Field>
        <Field label="Sig'imi" error={errors.capacity?.message}>
          {(p) => <Input {...p} type="number" min={1} {...register("capacity")} />}
        </Field>
        <Checkbox label="Faol" {...register("is_active")} />
      </form>
    </Modal>
  );
}

export default function RoomsPage() {
  const me = useMe();
  const list = usePagedList<Room>("rooms", "/rooms/");
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const [editing, setEditing] = useState<Room | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const remove = useAction((id: number) => del(`/rooms/${id}/`), {
    success: "Xona o'chirildi.",
    invalidate: ["rooms"],
    onSuccess: () => setDeleting(null),
  });
  return (
    <>
      <PageHeader
        title="Xonalar"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
            Xona qo'shish
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} />
          {me.role === "superadmin" && (
            <Select className="sm:w-56" value={String(list.filters.branch ?? "")} onChange={(e) => list.setFilter("branch", e.target.value)} aria-label="Filial">
              <option value="">Barcha filiallar</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Xona", cell: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
            { key: "branch", header: "Filial", cell: (r) => r.branch_name },
            { key: "capacity", header: "Sig'im", cell: (r) => r.capacity ?? "—", className: "tabular" },
            {
              key: "status",
              header: "Holat",
              cell: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Faol" : "Nofaol"}</Badge>,
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (r) => (
                <div className="flex justify-end gap-1">
                  <IconButton label="Tahrirlash" onClick={() => setEditing(r)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="O'chirish" onClick={() => setDeleting(r)} className="hover:text-danger">
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              ),
            },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {editing !== undefined && <RoomForm room={editing} onClose={() => setEditing(undefined)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Xonani o'chirish"
        description={`"${deleting?.name}" xonasi o'chiriladi. Darslarda ishlatilgan bo'lsa, o'chirish o'rniga nofaol qiling.`}
        confirmLabel="O'chirish"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
