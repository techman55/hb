"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redeemLinkToken } from "../../actions";

export function VerifyButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-8">
      {error ? (
        <>
          <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          <Button asChild size="lg" className="mt-4 w-full">
            <Link href="/login">Get a new link</Link>
          </Button>
        </>
      ) : (
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await redeemLinkToken(token);
              if (res && !res.ok) setError(res.error);
            })
          }
        >
          Continue
        </Button>
      )}
    </div>
  );
}
