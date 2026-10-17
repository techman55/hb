import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { ListingGrid } from "@/components/listing/listing-card";
import { SchoolChip } from "@/components/school-chip";
import { Avatar, EmptyState } from "@/components/ui/bits";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { friendState } from "@/lib/friends";
import { browseListings } from "@/lib/listings/queries";
import { db } from "@/lib/server";
import { firstName } from "@/lib/utils";
import { FriendButtons } from "../../me/me-client";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: PageProps<"/u/[id]">) {
  const { id } = await params;
  const me = await requireUser();
  if (id === me.id) redirect("/me");
  const person = (await db().select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!person || person.status !== "active" || !person.onboardedAt) notFound();

  const [school, state, listings] = await Promise.all([
    getUserSchool(person.schoolId),
    friendState(db(), me.id, person.id),
    browseListings(db(), { id: me.id, schoolId: me.schoolId }, { ownerId: person.id }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={person.name} email={person.email} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{person.name}</h1>
          {school && <SchoolChip school={school} label={school.name} className="mt-2 max-w-full" />}
        </div>
        {state !== "self" && <FriendButtons otherId={person.id} state={state} />}
      </div>
      {listings.cards.length ? (
        <ListingGrid cards={listings.cards} />
      ) : (
        <EmptyState title={`${firstName(person.name, "They")} hasn't listed anything you can see yet`} />
      )}
    </div>
  );
}
