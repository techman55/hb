import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Thumb } from "@/components/rental/rental-bits";
import { ThreadLink } from "@/components/shell/unread";
import { Avatar, EmptyState, SectionTitle } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { listThreads } from "@/lib/chat/service";
import { incomingRequests } from "@/lib/friends";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";
import { timeAgo } from "@/lib/utils";
import { FriendButtons } from "../me/me-client";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const [threads, requests] = await Promise.all([listThreads(db(), user.id), incomingRequests(db(), user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted">Chats open when someone calls dibs</p>
      </div>
      {requests.length > 0 && (
        <section>
          <SectionTitle count={requests.length}>Friend requests</SectionTitle>
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-3xl bg-accent-soft p-3">
                <Link href={`/u/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={r.name} email={r.email} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.name ?? r.email}</p>
                    <p className="truncate text-xs text-muted">Wants to be friends · {timeAgo(r.at.getTime())}</p>
                  </div>
                </Link>
                <FriendButtons otherId={r.id} state="incoming" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {threads.length === 0 && requests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title="No messages yet"
          body="When you call dibs or someone calls dibs on your stuff, you can coordinate pickup here."
        />
      ) : (
        threads.length > 0 && (
          <section>
            {requests.length > 0 && <SectionTitle>Messages</SectionTitle>}
            <ul className="flex flex-col gap-1">
              {threads.map((t) => (
                <li key={t.rentalId}>
                  <ThreadLink
                    rentalId={t.rentalId}
                    unread={t.unread > 0}
                    className="group flex items-center gap-3 rounded-3xl p-2.5 transition hover:bg-surface"
                  >
                    <Thumb src={mediaUrl(t.cover)} className="size-14" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold group-data-unread:font-bold">{t.otherName ?? "A student"}</p>
                        {t.lastAt && <span className="shrink-0 text-xs text-muted">{timeAgo(t.lastAt)}</span>}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {t.role === "owner" ? "Renting your " : "Your rental: "}
                        {t.title}
                      </p>
                      <p className="truncate text-sm text-muted group-data-unread:font-semibold group-data-unread:text-ink">
                        {t.lastBody ?? "No messages yet"}
                      </p>
                    </div>
                    <span className="hidden size-2.5 shrink-0 rounded-full bg-accent group-data-unread:block" aria-label="Unread" />
                  </ThreadLink>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
