import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VerifyButton } from "./verify-button";

export const metadata: Metadata = { title: "Sign in" };

// The token is only redeemed on an explicit click (POST). University mail filters such as
// Safe Links open every URL in an email, and a GET that signed in would burn the link.
export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 20) {
    return (
      <div>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">That link looks broken</h1>
        <p className="mt-2 text-muted">Request a new one and use the latest email.</p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-[32px] font-bold leading-tight tracking-tight">You&apos;re almost in</h1>
      <p className="mt-2 text-muted">Tap continue to finish signing in on this device.</p>
      <VerifyButton token={token} />
    </div>
  );
}
