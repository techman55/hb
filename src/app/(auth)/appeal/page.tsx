import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { AppealForm } from "./appeal-form";

export const metadata: Metadata = { title: "Request access" };

export default async function AppealPage({ searchParams }: PageProps<"/appeal">) {
  const { email } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? "/" : "/welcome");
  return <AppealForm initialEmail={typeof email === "string" ? email.slice(0, 254) : ""} />;
}
