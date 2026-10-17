"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, MapPin } from "lucide-react";
import type { ChatMessage } from "@/lib/chat/service";
import { cn } from "@/lib/utils";

const MAX = 500;
const QUICK = ["I'm here", "Running 5 min late", "Can we do tomorrow instead?", "Thanks!"];

function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function ChatThread({
  rentalId,
  me,
  initial,
  otherName,
  open,
  spots,
}: {
  rentalId: string;
  me: string;
  initial: ChatMessage[];
  otherName: string;
  open: boolean;
  spots: { name: string; note: string | null }[];
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [showSpots, setShowSpots] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastAt = useRef(initial.at(-1)?.createdAt ?? 0);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTypingSent = useRef(0);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((list) => {
      const seen = new Set(list.map((m) => m.id));
      const next = [...list, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.createdAt - b.createdAt);
      lastAt.current = next.at(-1)?.createdAt ?? lastAt.current;
      return next;
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${rentalId}?after=${lastAt.current}`, { cache: "no-store" });
      if (res.ok) merge(((await res.json()) as { messages: ChatMessage[] }).messages);
    } catch {
      /* offline */
    }
  }, [rentalId, merge]);

  // Live updates over a WebSocket to the thread's Durable Object; polling covers local dev and drops.
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/chat/${rentalId}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as { type: string; message?: ChatMessage; userId?: string };
          if (data.type === "message" && data.message) {
            merge([data.message]);
            setTyping(false);
          } else if (data.type === "typing" && data.userId !== me) {
            setTyping(true);
            clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 3500);
          }
        } catch {
          /* pong or junk */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    const ping = setInterval(() => wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send("ping"), 25_000);
    const fallback = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) void poll();
    }, 4000);
    const safety = setInterval(() => void poll(), 20_000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      clearInterval(fallback);
      clearInterval(safety);
      wsRef.current?.close();
    };
  }, [rentalId, me, merge, poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/${rentalId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Couldn't send");
      merge([data.message]);
      setDraft("");
      setShowSpots(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  };

  // Suggestions only fill the box; the user still decides to send.
  const suggest = (text: string) => {
    setDraft(text.slice(0, MAX));
    setShowSpots(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onType = (v: string) => {
    setDraft(v.slice(0, MAX));
    const now = Date.now();
    if (now - lastTypingSent.current > 2500 && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send("typing");
      lastTypingSent.current = now;
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1.5 pb-44">
        {messages.map((m, i) => {
          if (m.kind === "system") {
            return (
              <p key={m.id} className="mx-auto my-2 max-w-[85%] rounded-full bg-surface-2 px-3.5 py-1.5 text-center text-xs font-medium text-muted">
                {m.body}
              </p>
            );
          }
          const mine = m.senderId === me;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId && m.createdAt - prev.createdAt < 120_000;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start", !grouped && "mt-2")}>
              <div
                className={cn(
                  "max-w-[78%] whitespace-pre-wrap break-words rounded-[22px] px-4 py-2.5 text-[15px] leading-snug",
                  mine ? "rounded-br-md bg-ink text-ink-inverse" : "rounded-bl-md bg-surface ring-1 ring-line",
                )}
                title={timeLabel(m.createdAt)}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        {typing && <p className="mt-2 text-xs text-muted">{otherName} is typing…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+60px)] z-30 border-t border-line bg-bg/95 px-4 pb-3 pt-2 backdrop-blur lg:bottom-0 lg:left-64 xl:right-80">
        <div className="mx-auto max-w-[680px]">
          {open ? (
            <>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
                {spots.length > 0 && (
                  <button
                    onClick={() => setShowSpots(!showSpots)}
                    className={cn("flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-medium", showSpots ? "bg-ink text-ink-inverse" : "bg-surface ring-1 ring-line")}
                  >
                    <MapPin className="size-3.5" /> Suggest a spot
                  </button>
                )}
                {QUICK.map((q) => (
                  <button key={q} onClick={() => suggest(q)} className="h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] font-medium ring-1 ring-line">
                    {q}
                  </button>
                ))}
              </div>
              {showSpots && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {spots.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => suggest(`Can we meet at ${s.name}${s.note ? ` (${s.note.toLowerCase()})` : ""}?`)}
                      className="rounded-2xl bg-accent-soft px-3 py-2 text-left text-sm font-medium text-accent"
                    >
                      {s.name}
                      {s.note && <span className="block text-xs font-normal opacity-80">{s.note}</span>}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${otherName}`}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line bg-surface px-4 py-2.5 text-[15px] outline-none focus:border-ink"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label="Send"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-ink-inverse transition active:scale-95 disabled:opacity-30"
                >
                  <ArrowUp className="size-5" strokeWidth={2.5} />
                </button>
              </form>
              {draft.length > MAX - 80 && <p className="mt-1 text-right text-xs text-muted">{MAX - draft.length} left</p>}
            </>
          ) : (
            <p className="py-3 text-center text-sm text-muted">This chat is closed.</p>
          )}
        </div>
      </div>
    </div>
  );
}
