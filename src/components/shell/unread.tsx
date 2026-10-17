"use client";

import { createContext, use, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Unread = { opened: (rentalId: string) => boolean; inbox: number };

const UnreadContext = createContext<Unread>({ opened: () => false, inbox: 0 });

const openThread = (path: string) => path.match(/^\/inbox\/([^/]+)/)?.[1] ?? null;

/**
 * The shared layout isn't re-rendered when you open a chat, so its server counts lag behind.
 * Chats opened since the last server update are treated as read here, which clears the badge
 * the moment a chat is on screen. Fresh server data replaces the guesswork.
 */
export function UnreadProvider({
  unread,
  friendRequests,
  children,
}: {
  unread: { id: string; at: number }[];
  friendRequests: number;
  children: React.ReactNode;
}) {
  const current = openThread(usePathname());
  // Includes each chat's newest message, so a new message in a chat you already opened shows again.
  const key = unread.map((u) => `${u.id}:${u.at}`).join(",");
  const [state, setState] = useState({ key, seen: new Set(current ? [current] : []) });
  let seen = state.seen;
  if (state.key !== key) {
    // New server data already reflects every chat read before it; keep only the one on screen.
    seen = new Set(current ? [current] : []);
    setState({ key, seen });
  } else if (current && !seen.has(current)) {
    seen = new Set(seen).add(current);
    setState({ key, seen });
  }

  const opened = (id: string) => seen.has(id);
  const inbox = unread.filter((u) => !seen.has(u.id)).length + friendRequests;
  return <UnreadContext value={{ opened, inbox }}>{children}</UnreadContext>;
}

export const useUnread = () => use(UnreadContext);

/**
 * An inbox row. Sets `data-unread` so the server-rendered row can style itself, and drops it as
 * soon as the chat is opened (Back can show a cached copy of the inbox from before).
 */
export function ThreadLink({
  rentalId,
  unread,
  className,
  children,
}: {
  rentalId: string;
  unread: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { opened } = useUnread();
  return (
    <Link href={`/inbox/${rentalId}`} data-unread={(unread && !opened(rentalId)) || undefined} className={className}>
      {children}
    </Link>
  );
}
