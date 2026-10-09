import { BookOpen, Clock, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/Table";
import { isStaff, useMe } from "@/lib/auth";
import { money } from "@/lib/format";
import { usePagedList } from "@/lib/hooks";
import type { Course } from "@/lib/types";

import { CourseForm } from "./CourseForm";

export default function CoursesPage() {
  const me = useMe();
  const staff = isStaff(me.role);
  const list = usePagedList<Course>("courses", "/courses/", {}, 24);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Kurslar"
        description={staff ? "Umumiy kurslar barcha filiallarda, filial kurslari faqat o'z filialida ko'rinadi." : undefined}
        actions={
          staff && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Kurs qo'shish
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Kurs nomi yoki kodi" />
        {staff && (
          <Select
            className="sm:w-44"
            aria-label="Holat"
            value={list.filters.is_active === undefined ? "" : String(list.filters.is_active)}
            onChange={(e) => list.setFilter("is_active", e.target.value === "" ? undefined : e.target.value === "true")}
          >
            <option value="">Barcha holat</option>
            <option value="true">Faol</option>
            <option value="false">Nofaol</option>
          </Select>
        )}
      </div>
      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.rows?.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="Kurslar topilmadi" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.rows?.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
                    <BookOpen className="size-5" aria-hidden />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge tone={c.branch ? "info" : "brand"} dot={false}>
                      {c.branch_name ?? "Umumiy"}
                    </Badge>
                    {!c.is_active && <Badge tone="neutral">Nofaol</Badge>}
                  </div>
                </div>
                <h3 className="mt-4 font-semibold text-ink-900 group-hover:text-brand-700">{c.name}</h3>
                <p className="text-[13px] text-ink-500">{c.code}</p>
                <p className="mt-2 line-clamp-2 flex-1 text-[13px] text-ink-600">{c.description || "Tavsif kiritilmagan."}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-ink-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> {c.duration_months} oy
                  </span>
                  <span className="flex items-center gap-1">
                    <UsersRound className="size-3.5" aria-hidden /> {c.groups_count} guruh
                  </span>
                  <span className="tabular font-semibold text-ink-900">{money(c.monthly_price)}/oy</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      {creating && <CourseForm onClose={() => setCreating(false)} />}
    </>
  );
}
