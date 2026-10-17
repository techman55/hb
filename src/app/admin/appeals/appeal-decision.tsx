"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Hint, Input, Label, Textarea } from "@/components/ui/field";
import { runAction } from "../_components/action-controls";
import { SelectField } from "../_components/ui";
import { approveAppeal, denyAppeal } from "../actions";

const NEW_SCHOOL = "__new";

export type SchoolOption = { id: string; name: string; domain: string; enabled: boolean };

export function AppealDecision({
  appealId,
  emailDomain,
  publicDomain,
  suggestedSchoolId,
  schools,
}: {
  appealId: string;
  emailDomain: string | null;
  /** True for gmail.com and friends, where a domain-wide exception would let anyone in. */
  publicDomain: boolean;
  suggestedSchoolId: string | null;
  schools: SchoolOption[];
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "deny">("idle");
  const [schoolId, setSchoolId] = useState(suggestedSchoolId ?? "");
  const [newDomain, setNewDomain] = useState(publicDomain ? "" : (emailDomain ?? ""));
  const [addDomain, setAddDomain] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const ids = { school: `school-${appealId}`, domain: `domain-${appealId}`, add: `add-${appealId}`, note: `note-${appealId}` };

  const approve = () =>
    start(async () => {
      await runAction(() =>
        approveAppeal(appealId, {
          schoolId: schoolId === NEW_SCHOOL ? undefined : schoolId || undefined,
          newDomain: schoolId === NEW_SCHOOL ? newDomain : undefined,
          addDomain,
        }),
      );
    });

  const deny = () =>
    start(async () => {
      await runAction(() => denyAppeal(appealId, note));
    });

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode("approve")}>
          Approve…
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMode("deny")}>
          Deny…
        </Button>
      </div>
    );
  }

  if (mode === "deny") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line p-3">
        <div>
          <Label htmlFor={ids.note}>Note to them (optional)</Label>
          <Textarea
            id={ids.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-20 text-sm"
            placeholder="We couldn't confirm you're a current student. Reply with your enrollment letter and we'll take another look."
            autoFocus
          />
          <Hint>Included in the email we send.</Hint>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" loading={pending} onClick={deny}>
            Deny request
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const ready = schoolId === NEW_SCHOOL ? newDomain.trim().length > 3 : Boolean(schoolId);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-3">
      <div>
        <Label htmlFor={ids.school}>School</Label>
        <SelectField id={ids.school} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          <option value="" disabled>
            Choose a school…
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.domain}){s.enabled ? "" : " · off"}
            </option>
          ))}
          <option value={NEW_SCHOOL}>+ Create a new school</option>
        </SelectField>
      </div>
      {schoolId === NEW_SCHOOL && (
        <div>
          <Label htmlFor={ids.domain}>School domain</Label>
          <Input
            id={ids.domain}
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="college.org"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Hint>Anyone with an email at this domain will be able to sign in.</Hint>
        </div>
      )}
      {emailDomain && (
        <label htmlFor={ids.add} className="flex items-start gap-2.5 text-sm">
          <input
            id={ids.add}
            type="checkbox"
            checked={addDomain}
            onChange={(e) => setAddDomain(e.target.checked)}
            disabled={publicDomain}
            className="mt-0.5 size-4 accent-ink"
          />
          <span className={publicDomain ? "text-muted" : undefined}>
            Also let everyone at <span className="font-semibold">@{emailDomain}</span> sign in
            {publicDomain && <span className="block text-xs">Not available for public email providers.</span>}
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending} disabled={!ready} onClick={approve}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
