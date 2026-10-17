import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { safeNext } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const path = safeNext(next);
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? (path ?? "/") : path ? `/welcome?next=${encodeURIComponent(path)}` : "/welcome");
  return <LoginForm next={path} />;
}
