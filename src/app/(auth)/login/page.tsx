import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? "/" : "/welcome");
  return <LoginForm next={typeof next === "string" ? next : null} />;
}
