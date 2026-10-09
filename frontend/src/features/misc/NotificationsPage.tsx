import { useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/Button";
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { Pagination, Tabs } from "@/components/ui/Table";
import { post } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { usePagedList } from "@/lib/hooks";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const list = usePagedList<NotificationItem>("notifications", "/notifications/");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const filter = list.filters.is_read === false ? "unread" : "all";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Bildirishnomalar"
        actions={
          <Button
            variant="secondary"
            icon={<CheckCheck className="size-4" />}
            onClick={async () => {
              await post("/notifications/read-all/");
              refresh();
            }}
          >
            Hammasini o'qildi deb belgilash
          </Button>
        }
      />
      <Card>
        <Tabs
          className="px-4"
          value={filter}
          onChange={(v) => list.setFilter("is_read", v === "unread" ? false : undefined)}
          tabs={[
            { value: "all", label: "Barchasi" },
            { value: "unread", label: "O'qilmagan" },
          ]}
        />
        {list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.rows?.length === 0 ? (
          <EmptyState icon={BellOff} title="Bildirishnomalar yo'q" />
        ) : (
          <ul>
            {list.rows?.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!n.is_read) {
                      await post(`/notifications/${n.id}/read/`);
                      refresh();
                    }
                    if (n.link) navigate(n.link);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b border-line px-5 py-4 text-left last:border-0 hover:bg-ink-50",
                    !n.is_read && "bg-brand-50/40",
                  )}
                >
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", !n.is_read && "bg-brand-600")} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink-900">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-ink-600">{n.body}</span>}
                    <span className="mt-1 block text-xs text-ink-400" title={dateTime(n.created_at)}>
                      {relative(n.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
    </div>
  );
}
