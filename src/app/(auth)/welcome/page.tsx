import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { safeNext } from "@/lib/utils";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const next = safeNext((await searchParams).next);
  const user = await requireUser({ allowUnonboarded: true });
  if (user.onboardedAt) redirect(next ?? "/");
  const school = await getUserSchool(user.schoolId);
  return (
    <Onboarding
      email={user.email}
      initialName={user.name ?? ""}
      phoneVerified={!!user.phoneVerifiedAt}
      next={next}
      school={school ?? { name: "your school", shortName: "", logoUrl: null, accent: null }}
    />
  );
}
