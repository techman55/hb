import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { SchoolChip } from "@/components/school-chip";
import { Avatar } from "@/components/ui/bits";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { friendState } from "@/lib/friends";
import { db } from "@/lib/server";
import { firstName } from "@/lib/utils";
import { FriendButtons } from "../../me/me-client";

export const metadata: Metadata = { title: "Add friend" };

/** Target of the personal QR code / share link on the Me page. */
export default async function AddFriendPage({ params }: PageProps<"/f/[code]">) {
  const { code } = await params;
  const me = await requireUser({ next: `/f/${code}` });
  const person = (await db().select().from(users).where(eq(users.friendCode, code)).limit(1))[0];
  if (!person || person.status !== "active") notFound();
  if (person.id === me.id) redirect("/me#friends");
  const [school, state] = await Promise.all([getUserSchool(person.schoolId), friendState(db(), me.id, person.id)]);

  return (
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center rounded-[32px] bg-surface p-8 text-center ring-1 ring-line">
      <Avatar name={person.name} email={person.email} size={80} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{person.name}</h1>
      {school && <SchoolChip school={school} label={school.name} className="mt-2" />}
      <p className="mt-4 text-sm text-muted">
        {state === "friends"
          ? `You and ${firstName(person.name)} are friends.`
          : `Friends can see each other's friends-only listings.`}
      </p>
      <div className="mt-6">{state !== "self" && <FriendButtons otherId={person.id} state={state} />}</div>
    </div>
  );
}
