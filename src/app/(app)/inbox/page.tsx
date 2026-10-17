import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Thumb } from "@/components/rental/rental-bits";
import { EmptyState } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { listThreads } from "@/lib/chat/service";
import { mediaUrl } from "@/lib/media";
import { db } from "@/lib/server";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const threads = await listThreads(db(), user.id);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted">Chats open when someone calls dibs</p>
      </div>
      {threads.length === 0 ? (
        <EmptyState icon={<Inbox className="size-8" />} title="No messages yet" body="When you call dibs or someone calls dibs on your stuff, you can coordinate pickup here." />
      ) : (
        <ul className="flex flex-col gap-1">
          {threads.map((t) => (
            <li key={t.rentalId}>
              <Link href={`/inbox/${t.rentalId}`} className="flex items-center gap-3 rounded-3xl p-2.5 transition hover:bg-surface">
                <Thumb src={mediaUrl(t.cover)} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate", t.unread ? "font-bold" : "font-semibold")}>{t.otherName ?? "A student"}</p>
                    {t.lastAt && <span className="shrink-0 text-xs text-muted">{timeAgo(t.lastAt)}</span>}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {t.role === "owner" ? "Renting your " : "Your rental: "}
                    {t.title}
                  </p>
                  <p className={cn("truncate text-sm", t.unread ? "font-semibold text-ink" : "text-muted")}>{t.lastBody ?? "No messages yet"}</p>
                </div>
                {t.unread > 0 && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label={`${t.unread} unread`} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
