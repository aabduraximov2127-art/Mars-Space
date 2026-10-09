import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, GraduationCap, KeyRound, LogOut, Menu, User as UserIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { NAV } from "@/app/nav";
import { Avatar, Badge } from "@/components/ui/display";
import { get, post } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { relative } from "@/lib/format";
import { ROLE, label, tone } from "@/lib/labels";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const settings = useQuery({
    queryKey: ["settings-public"],
    queryFn: () => get<{ center_name: string }>("/settings/public/"),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink-900">{settings.data?.center_name ?? "EduCentr"}</span>
          <span className="block truncate text-xs text-ink-500">{me.branch_name ?? "Barcha filiallar"}</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Asosiy navigatsiya">
        {NAV[me.role].map((section, i) => (
          <div key={i} className="mb-4">
            {section.title && (
              <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700 before:absolute before:top-1.5 before:bottom-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand-600"
                          : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOutside, active]);
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false), open);
  const count = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => get<{ count: number }>("/notifications/unread-count/"),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ["notifications", "latest"],
    queryFn: () => get<{ results: NotificationItem[] }>("/notifications/", { page_size: 8 }),
    enabled: open,
  });
  const unread = count.data?.count ?? 0;
  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.is_read) {
      await post(`/notifications/${n.id}/read/`).catch(() => undefined);
      count.refetch();
    }
    if (n.link) navigate(n.link);
  };
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Bildirishnomalar${unread ? `, ${unread} ta o'qilmagan` : ""}`}
        aria-expanded={open}
        className="relative rounded-md p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="tabular absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 z-40 mt-2 w-[min(92vw,380px)] rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold text-ink-900">Bildirishnomalar</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-[13px] font-medium text-brand-700 hover:underline"
                onClick={async () => {
                  await post("/notifications/read-all/");
                  count.refetch();
                  list.refetch();
                }}
              >
                Hammasini o'qildi
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {list.isLoading && <li className="px-4 py-6 text-center text-ink-500">Yuklanmoqda…</li>}
            {list.data?.results.length === 0 && (
              <li className="px-4 py-8 text-center text-ink-500">Bildirishnomalar yo'q</li>
            )}
            {list.data?.results.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-ink-50",
                    !n.is_read && "bg-brand-50/50",
                  )}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-brand-600")} />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-900">{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-[13px] text-ink-500">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-ink-400">{relative(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-brand-700 hover:bg-ink-50"
          >
            Barchasini ko'rish
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-md py-1 pr-2 pl-1 hover:bg-ink-100"
      >
        <Avatar name={me.full_name} src={me.avatar} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[160px] truncate text-[13px] leading-tight font-medium text-ink-900">
            {me.full_name}
          </span>
          <span className="block text-[11px] leading-tight text-ink-500">{label(ROLE, me.role)}</span>
        </span>
        <ChevronDown className="hidden size-4 text-ink-400 sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="animate-fade-in absolute right-0 z-40 mt-2 w-60 rounded-lg border border-line bg-surface py-1 shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-medium text-ink-900">{me.full_name}</p>
            <p className="truncate text-[13px] text-ink-500">{me.phone}</p>
            <Badge tone={tone(ROLE, me.role)} className="mt-2">
              {label(ROLE, me.role)}
            </Badge>
          </div>
          {[
            { to: "/profile", icon: UserIcon, text: "Profil" },
            { to: "/change-password", icon: KeyRound, text: "Parolni o'zgartirish" },
          ].map((item) => (
            <Link
              key={item.to}
              role="menuitem"
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-ink-700 hover:bg-ink-50"
            >
              <item.icon className="size-4 text-ink-400" aria-hidden />
              {item.text}
            </Link>
          ))}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden />
            Chiqish
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-70 rounded-md bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Asosiy kontentga o'tish
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
          <div className="animate-fade-in absolute inset-0 bg-ink-900/40" onClick={() => setDrawer(false)} />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-surface shadow-pop">
            <button
              type="button"
              className="absolute top-4 right-3 rounded-md p-1.5 text-ink-400 hover:bg-ink-100"
              onClick={() => setDrawer(false)}
              aria-label="Menyuni yopish"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Menyuni ochish"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationsBell />
            <ProfileMenu />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
