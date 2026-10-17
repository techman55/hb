"use client";

import { useState } from "react";
import { SchoolLogo } from "@/components/school-chip";
import { Hint, Input, Label } from "@/components/ui/field";
import type { ActionResult } from "@/lib/admin";
import { ActionForm, SubmitButton } from "../../_components/action-controls";
import { Toggle } from "../../_components/ui";

const HEX = /^#[0-9a-f]{6}$/i;

export function SchoolForm({
  action,
  school,
}: {
  action: (data: FormData) => Promise<ActionResult>;
  school: { name: string; shortName: string | null; accent: string | null; enabled: boolean; acronym: string };
}) {
  const [name, setName] = useState(school.name);
  const [shortName, setShortName] = useState(school.shortName ?? "");
  const [accent, setAccent] = useState(school.accent ?? "");
  const valid = HEX.test(accent);

  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div>
          <Label htmlFor="school-name">Name</Label>
          <Input id="school-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </div>
        <div>
          <Label htmlFor="school-short">Short name</Label>
          <Input
            id="school-short"
            name="shortName"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={16}
            placeholder={school.acronym}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="school-accent">Accent color</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Pick accent color"
            value={valid ? accent.toLowerCase() : "#000000"}
            onChange={(e) => setAccent(e.target.value.toUpperCase())}
            className="size-12 shrink-0 cursor-pointer rounded-2xl border border-line bg-surface p-1"
          />
          <Input
            id="school-accent"
            name="accent"
            value={accent}
            onChange={(e) => setAccent(e.target.value.trim())}
            placeholder="#9E1B32"
            maxLength={7}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={accent !== "" && !valid}
            className="max-w-40 font-mono uppercase"
          />
          <SchoolLogo
            school={{ name, shortName: shortName || school.acronym, logoUrl: null, accent: valid ? accent : null }}
            size={44}
          />
        </div>
        <Hint>Tints the monogram when there&apos;s no logo. Leave empty for the default.</Hint>
      </div>

      <div>
        <Toggle name="enabled" label="Open on Dibs" defaultChecked={school.enabled} />
        <Hint>Turning a school off blocks email sign-ins from its domains. Anyone already signed in stays signed in.</Hint>
      </div>

      <SubmitButton className="self-start">Save changes</SubmitButton>
    </ActionForm>
  );
}
