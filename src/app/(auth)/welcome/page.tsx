import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await requireUser({ allowUnonboarded: true });
  if (user.onboardedAt) redirect("/");
  const school = await getUserSchool(user.schoolId);
  return (
    <Onboarding
      email={user.email}
      initialName={user.name ?? ""}
      phoneVerified={!!user.phoneVerifiedAt}
      school={school ?? { name: "your school", shortName: "", logoUrl: null, accent: null }}
    />
  );
}
