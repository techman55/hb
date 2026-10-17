import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { LogOut, Shield } from "lucide-react";
import { categoryFollows, users } from "@/db/schema";
import { SchoolChip } from "@/components/school-chip";
import { Avatar, SectionTitle } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { appUrl } from "@/lib/env";
import { friendIds, incomingRequests } from "@/lib/friends";
import { formatPhone } from "@/lib/phone";
import { db, env } from "@/lib/server";
import { logout } from "@/app/(auth)/actions";
import { FollowChips, FriendButtons, FriendCode, PhoneSettings, ProfileForm } from "./me-client";

export const metadata: Metadata = { title: "Me" };

function Panel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-[28px] bg-surface p-5 ring-1 ring-line">
      {children}
    </section>
  );
}

export default async function MePage() {
  const user = await requireUser();
  const [school, requests, ids, follows] = await Promise.all([
    getUserSchool(user.schoolId),
    incomingRequests(db(), user.id),
    friendIds(db(), user.id),
    db().select({ c: categoryFollows.category }).from(categoryFollows).where(eq(categoryFollows.userId, user.id)),
  ]);
  const friends = ids.length
    ? await db().select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} email={user.email} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
          {school && <SchoolChip school={school} label={school.name} className="mt-2 max-w-full" />}
        </div>
      </div>

      <Panel id="friends">
        <SectionTitle count={friends.length}>Friends</SectionTitle>
        {requests.length > 0 && (
          <ul className="mb-5 flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-accent-soft p-3">
                <Avatar name={r.name} email={r.email} size={36} />
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold">{r.name ?? r.email}</span> wants to be friends
                </p>
                <FriendButtons otherId={r.id} state="incoming" />
              </li>
            ))}
          </ul>
        )}
        <FriendCode url={appUrl(env(), `/f/${user.friendCode}`)} />
        {friends.length > 0 && (
          <ul className="mt-5 flex flex-col divide-y divide-line">
            {friends.map((f) => (
              <li key={f.id}>
                <Link href={`/u/${f.id}`} className="flex items-center gap-3 py-2.5">
                  <Avatar name={f.name} email={f.email} size={32} />
                  <span className="font-medium">{f.name ?? f.email}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <SectionTitle>Profile</SectionTitle>
        <ProfileForm name={user.name ?? ""} venmo={user.venmo ?? ""} cashapp={user.cashapp ?? ""} />
      </Panel>

      <Panel>
        <SectionTitle>Phone sign-in</SectionTitle>
        <PhoneSettings phone={user.phoneVerifiedAt ? formatPhone(user.phone) : null} />
      </Panel>

      <Panel>
        <SectionTitle>Following</SectionTitle>
        <p className="mb-3 text-sm text-muted">Listings in these categories show up in your Following feed.</p>
        <FollowChips following={follows.map((f) => f.c)} />
      </Panel>

      <div className="flex flex-col gap-2 sm:flex-row">
        {user.role === "admin" && (
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <Link href="/admin">
              <Shield className="size-4" /> Admin
            </Link>
          </Button>
        )}
        <form action={logout} className="flex-1">
          <Button type="submit" variant="ghost" size="lg" className="w-full">
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
