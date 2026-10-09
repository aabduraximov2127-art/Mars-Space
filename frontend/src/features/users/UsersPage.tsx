import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/form";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { useMe } from "@/lib/auth";
import { date, phone } from "@/lib/format";
import { useOptions, usePagedList } from "@/lib/hooks";
import type { Branch, Role, User } from "@/lib/types";

import { UserForm } from "./UserForm";

const TITLES: Record<string, { title: string; add: string; description: string }> = {
  admin: { title: "Adminlar", add: "Admin qo'shish", description: "Filial administratorlari." },
  teacher: { title: "Ustozlar", add: "Ustoz qo'shish", description: "Markaz ustozlari va ularning ma'lumotlari." },
  student: { title: "Studentlar", add: "Student qo'shish", description: "Barcha studentlar ro'yxati." },
};

export function UsersPage({ role }: { role: Role }) {
  const me = useMe();
  const navigate = useNavigate();
  const list = usePagedList<User>("users", "/users/", { role });
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const [creating, setCreating] = useState(false);
  const t = TITLES[role];
  const filtered = Boolean(list.filters.search || list.filters.is_active !== undefined || list.filters.branch);

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t.add}
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput
            value={String(list.filters.search ?? "")}
            onChange={(v) => list.setFilter("search", v)}
            placeholder="Ism, telefon yoki email"
          />
          {me.role === "superadmin" && (
            <Select
              className="sm:w-52"
              aria-label="Filial"
              value={String(list.filters.branch ?? "")}
              onChange={(e) => list.setFilter("branch", e.target.value)}
            >
              <option value="">Barcha filiallar</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            className="sm:w-40"
            aria-label="Holat"
            value={list.filters.is_active === undefined ? "" : String(list.filters.is_active)}
            onChange={(e) => list.setFilter("is_active", e.target.value === "" ? undefined : e.target.value === "true")}
          >
            <option value="">Barcha holat</option>
            <option value="true">Faol</option>
            <option value="false">Bloklangan</option>
          </Select>
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/users/${r.id}`)}
          empty={
            filtered ? (
              <EmptyState
                title="Hech narsa topilmadi"
                action={
                  <Button variant="secondary" size="sm" onClick={list.resetFilters}>
                    Filterni tozalash
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={`Hali ${t.title.toLowerCase()} yo'q`}
                action={
                  <Button size="sm" onClick={() => setCreating(true)}>
                    {t.add}
                  </Button>
                }
              />
            )
          }
          columns={[
            {
              key: "name",
              header: "F.I.Sh.",
              cell: (r) => (
                <div className="flex items-center gap-3">
                  <Avatar name={r.full_name} src={r.avatar} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{r.full_name}</p>
                    <p className="truncate text-[13px] text-ink-500">{r.email || "—"}</p>
                  </div>
                </div>
              ),
            },
            { key: "phone", header: "Telefon", cell: (r) => <span className="tabular whitespace-nowrap">{phone(r.phone)}</span> },
            ...(me.role === "superadmin" ? [{ key: "branch", header: "Filial", cell: (r: User) => r.branch_name ?? "—" }] : []),
            ...(role === "teacher"
              ? [{ key: "spec", header: "Mutaxassislik", cell: (r: User) => r.profile?.specialization || "—" }]
              : []),
            ...(role === "student"
              ? [{ key: "parent", header: "Ota-ona", cell: (r: User) => (r.profile?.parent_phone ? phone(r.profile.parent_phone) : "—") }]
              : []),
            { key: "created", header: "Qo'shilgan", cell: (r) => date(r.created_at) },
            {
              key: "status",
              header: "Holat",
              cell: (r) => <Badge tone={r.is_active ? "success" : "danger"}>{r.is_active ? "Faol" : "Bloklangan"}</Badge>,
            },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {creating && <UserForm role={role} onClose={() => setCreating(false)} />}
    </>
  );
}
