"use client";

import { useOptimistic, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFollow } from "@/app/actions/profile";

export function FollowCategory({ category, following }: { category: string; following: boolean }) {
  const [on, setOn] = useOptimistic(following);
  const [, start] = useTransition();
  return (
    <button
      onClick={() =>
        start(async () => {
          setOn(!on);
          await toggleFollow(category, !on);
        })
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition",
        on ? "bg-ink text-ink-inverse" : "bg-surface ring-1 ring-line hover:ring-ink/30",
      )}
    >
      {on ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
      {on ? "Following" : "Follow"}
    </button>
  );
}
