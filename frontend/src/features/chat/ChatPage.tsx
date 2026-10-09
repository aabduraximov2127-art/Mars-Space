import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquarePlus, Send, Trash2, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/Button";
import { Avatar, Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { api, get, parseApiError, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { date, relative, ROLE_LABELS, time } from "@/lib/format";
import { ROLE, label, tone } from "@/lib/labels";
import type { ChatMessage, ChatRoom, Contact } from "@/lib/types";
import { cn } from "@/lib/utils";

function NewChatModal({ onClose, onOpen }: { onClose: () => void; onOpen: (roomId: number) => void }) {
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["chat-contacts", search], queryFn: () => get<Contact[]>("/chat/contacts/", { search }) });
  const open = async (c: Contact) => {
    try {
      const room = await post<ChatRoom>("/chat/rooms/direct/", { user_id: c.id });
      onOpen(room.id);
    } catch (err) {
      toast.error(parseApiError(err).detail);
    }
  };
  return (
    <Modal open onClose={onClose} title="Yangi suhbat" size="sm">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism bo'yicha qidirish" autoFocus aria-label="Qidirish" />
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
        {q.isLoading && <li className="py-6 text-center text-ink-500">Yuklanmoqda…</li>}
        {q.data?.length === 0 && <li className="py-6 text-center text-ink-500">Hech kim topilmadi</li>}
        {q.data?.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => open(c)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-ink-50">
              <Avatar name={c.full_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{c.full_name}</span>
                <span className="block text-xs text-ink-500">
                  {ROLE_LABELS[c.role]}
                  {c.branch_name ? ` · ${c.branch_name}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function Conversation({ room, onBack }: { room: ChatRoom; onBack: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    get<ChatMessage[]>(`/chat/rooms/${room.id}/messages/`)
      .then((m) => {
        if (!alive) return;
        setMessages(m);
        setHasOlder(m.length >= 50);
        setError(null);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    post(`/chat/rooms/${room.id}/read/`).then(() => qc.invalidateQueries({ queryKey: ["chat-rooms"] }));
    return () => {
      alive = false;
    };
  }, [room.id, qc]);

  // Poll for new messages every 5 s while the conversation is open.
  useEffect(() => {
    if (loading) return;
    const t = setInterval(async () => {
      try {
        const fresh = await get<ChatMessage[]>(`/chat/rooms/${room.id}/messages/`, { after_id: lastId });
        if (fresh.length) {
          setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
          post(`/chat/rooms/${room.id}/read/`).then(() => qc.invalidateQueries({ queryKey: ["chat-rooms"] }));
        }
      } catch {
        /* transient polling errors are ignored */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [room.id, lastId, loading, qc]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const loadOlder = async () => {
    const older = await get<ChatMessage[]>(`/chat/rooms/${room.id}/messages/`, { before_id: messages[0]?.id });
    setHasOlder(older.length >= 50);
    setMessages((m) => [...older, ...m]);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const msg = await post<ChatMessage>(`/chat/rooms/${room.id}/messages/`, { body: text });
      setMessages((m) => [...m, msg]);
      setBody("");
      qc.invalidateQueries({ queryKey: ["chat-rooms"] });
    } catch (err) {
      toast.error(parseApiError(err).detail);
    } finally {
      setSending(false);
    }
  };

  const remove = async (m: ChatMessage) => {
    try {
      await api.delete(`/chat/messages/${m.id}/`);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, is_deleted: true, body: "" } : x)));
    } catch (err) {
      toast.error(parseApiError(err).detail);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <IconButton label="Orqaga" onClick={onBack} className="md:hidden">
          <ArrowLeft className="size-5" />
        </IconButton>
        {room.kind === "group" ? (
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <UsersRound className="size-4" aria-hidden />
          </span>
        ) : (
          <Avatar name={room.name} size="md" />
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{room.name}</p>
          <p className="text-xs text-ink-500">{room.kind === "group" ? "Guruh chati" : room.other_user ? ROLE_LABELS[room.other_user.role] : ""}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-4" aria-live="polite">
        {error ? (
          <ErrorState error={error} />
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title="Hali xabar yo'q" description="Birinchi bo'lib yozing." />
        ) : (
          <>
            {hasOlder && (
              <div className="mb-3 text-center">
                <Button variant="ghost" size="sm" onClick={loadOlder}>
                  Oldingi xabarlar
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {messages.map((m, i) => {
                const mine = m.sender === me.id;
                const d = date(m.created_at);
                const showDate = i === 0 || date(messages[i - 1].created_at) !== d;
                const canDelete = !m.is_deleted && (mine || me.role === "superadmin" || me.role === "admin");
                return (
                  <li key={m.id}>
                    {showDate && <p className="my-3 text-center text-xs font-medium text-ink-400">{d}</p>}
                    <div className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3.5 py-2 shadow-card",
                          mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-surface text-ink-800",
                        )}
                      >
                        {!mine && room.kind === "group" && (
                          <p className="mb-0.5 text-xs font-semibold text-brand-700">
                            {m.sender_name}{" "}
                            {m.sender_role !== "student" && (
                              <Badge tone={tone(ROLE, m.sender_role)} dot={false} className="ml-1 px-1 py-0 text-[10px]">
                                {label(ROLE, m.sender_role)}
                              </Badge>
                            )}
                          </p>
                        )}
                        {m.is_deleted ? (
                          <p className={cn("italic", mine ? "text-brand-100" : "text-ink-400")}>Xabar o'chirildi</p>
                        ) : (
                          <p className="break-words whitespace-pre-wrap">{m.body}</p>
                        )}
                        <p className={cn("mt-0.5 text-right text-[11px]", mine ? "text-brand-200" : "text-ink-400")}>{time(m.created_at)}</p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          aria-label="Xabarni o'chirish"
                          onClick={() => remove(m)}
                          className="rounded p-1 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Xabar yozing…"
          aria-label="Xabar"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
        <Button type="submit" loading={sending} disabled={!body.trim()} aria-label="Yuborish" icon={<Send className="size-4" />}>
          <span className="hidden sm:inline">Yuborish</span>
        </Button>
      </form>
    </div>
  );
}

export default function ChatPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const roomId = Number(params.get("room")) || null;
  const rooms = useQuery({
    queryKey: ["chat-rooms"],
    queryFn: () => get<ChatRoom[]>("/chat/rooms/"),
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });
  const selected = rooms.data?.find((r) => r.id === roomId) ?? null;
  const select = (id: number | null) => setParams(id ? { room: String(id) } : {});

  return (
    <div>
      <h1 className="sr-only">Chat</h1>
      <Card className="grid h-[calc(100dvh-8.5rem)] min-h-[420px] grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        <aside className={cn("flex min-h-0 min-w-0 flex-col border-line md:border-r", selected && "hidden md:flex")}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold text-ink-900">Suhbatlar</p>
            <IconButton label="Yangi suhbat" onClick={() => setCreating(true)}>
              <MessageSquarePlus className="size-5" />
            </IconButton>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {rooms.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-4 py-3">
                  <Skeleton className="h-10" />
                </li>
              ))}
            {rooms.error && <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />}
            {rooms.data?.length === 0 && (
              <EmptyState
                title="Suhbatlar yo'q"
                action={
                  <Button size="sm" onClick={() => setCreating(true)}>
                    Suhbat boshlash
                  </Button>
                }
              />
            )}
            {rooms.data?.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-ink-50",
                    r.id === roomId && "bg-brand-50 hover:bg-brand-50",
                  )}
                >
                  {r.kind === "group" ? (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <UsersRound className="size-4" aria-hidden />
                    </span>
                  ) : (
                    <Avatar name={r.name} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-ink-900">{r.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-400">{relative(r.last_message?.created_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-ink-500">
                        {r.last_message ? `${r.last_message.sender_name.split(" ")[0]}: ${r.last_message.body || "…"}` : "Xabar yo'q"}
                      </span>
                      {r.unread_count > 0 && (
                        <span className="tabular min-w-5 shrink-0 rounded-full bg-brand-600 px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
                          {r.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className={cn("min-h-0 min-w-0", !selected && "hidden md:block")}>
          {selected ? (
            <Conversation key={selected.id} room={selected} onBack={() => select(null)} />
          ) : (
            <EmptyState className="h-full" icon={MessageSquarePlus} title="Suhbatni tanlang" description="Chap tomondan suhbatni tanlang yoki yangisini boshlang." />
          )}
        </section>
      </Card>
      {creating && (
        <NewChatModal
          onClose={() => setCreating(false)}
          onOpen={async (id) => {
            setCreating(false);
            await rooms.refetch();
            select(id);
          }}
        />
      )}
    </div>
  );
}
