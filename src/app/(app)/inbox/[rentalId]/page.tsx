import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { rentalTiming, Thumb } from "@/components/rental/rental-bits";
import { Badge } from "@/components/ui/bits";
import { requireUser } from "@/lib/auth/current";
import { chatOpen, listMessages, markRead } from "@/lib/chat/service";
import { getRentalDetail } from "@/lib/rentals/detail";
import { db } from "@/lib/server";
import { getSettings } from "@/lib/settings";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Chat" };

export default async function ThreadPage({ params }: PageProps<"/inbox/[rentalId]">) {
  const { rentalId } = await params;
  const user = await requireUser();
  const detail = await getRentalDetail(db(), rentalId, user.id);
  if (!detail) notFound();
  const [messages, settings] = await Promise.all([listMessages(db(), rentalId), getSettings(db())]);
  await markRead(db(), rentalId, user.id);
  const { rental, listing, other, role, dueDate } = detail;
  const t = rentalTiming({ status: rental.status, startDate: rental.startDate, dueDate }, role);

  return (
    <div>
      <div className="sticky top-12 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:top-0 lg:-mx-6 lg:px-6">
        <Link href="/inbox" aria-label="Back to inbox" className="-ml-2 rounded-full p-1.5 hover:bg-surface-2">
          <ChevronLeft className="size-5" />
        </Link>
        <Link href={role === "owner" ? `/lending/rentals/${rental.id}` : `/dibs/${rental.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb src={listing.coverUrl} className="size-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{other.name ?? "A student"}</p>
            <p className="truncate text-xs text-muted">{listing.title}</p>
          </div>
        </Link>
        <Badge tone={t.tone}>{t.label}</Badge>
      </div>
      <ChatThread
        rentalId={rental.id}
        me={user.id}
        initial={messages}
        otherName={firstName(other.name, "them")}
        open={chatOpen(rental, settings.chatRetentionDays)}
        spots={detail.spots}
      />
    </div>
  );
}
