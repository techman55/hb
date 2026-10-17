import type { Metadata } from "next";
import { Card } from "@/components/ui/bits";
import { Hint, Input, Label } from "@/components/ui/field";
import { requireAdmin } from "@/lib/auth/current";
import { db } from "@/lib/server";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "../_components/action-controls";
import { PageHeader } from "../_components/ui";
import { saveAppSettings } from "../actions";

export const metadata: Metadata = { title: "Settings" };

function NumberField({
  name,
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  suffix,
}: {
  name: keyof typeof DEFAULT_SETTINGS;
  label: string;
  hint: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  const id = `setting-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input id={id} name={name} type="number" inputMode="decimal" defaultValue={value} min={min} max={max} step={step} required className="max-w-40 tabular-nums" />
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </div>
      <Hint>
        {hint} Allowed: {min}–{max.toLocaleString()}. Default {DEFAULT_SETTINGS[name]}.
      </Hint>
    </div>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings(db());

  return (
    <div>
      <PageHeader title="Settings" description="Changes apply from the next photo check or chat message. Nothing already decided is re-run." />

      <ActionForm action={saveAppSettings} className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight">AI photo checks</h2>
          <Card className="flex flex-col gap-6 p-4 sm:p-5">
            <NumberField
              name="aiThreshold"
              label="Hold for review at"
              value={s.aiThreshold}
              min={0.05}
              max={0.95}
              step={0.01}
              suffix="AI score"
              hint="Photos Sightengine scores at or above this go to Photo review. Lower catches more AI images and flags more real ones."
            />
            <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
              Sightengine&apos;s free plan covers <span className="font-semibold">500 checks a day</span> and{" "}
              <span className="font-semibold">2,000 a month</span>. Keep the caps a little under so a busy day never
              spills into paid usage. When a cap is reached, new photos wait in Photo review as a quota hold and are
              checked again once quota frees up.
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <NumberField
                name="sightengineDailyCap"
                label="Daily cap"
                value={s.sightengineDailyCap}
                min={0}
                max={500}
                suffix="checks"
                hint="Resets at midnight UTC."
              />
              <NumberField
                name="sightengineMonthlyCap"
                label="Monthly cap"
                value={s.sightengineMonthlyCap}
                min={0}
                max={2000}
                suffix="checks"
                hint="Resets on the 1st (UTC)."
              />
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight">Chat</h2>
          <Card className="p-4 sm:p-5">
            <NumberField
              name="chatRetentionDays"
              label="Keep chats open after a rental"
              value={s.chatRetentionDays}
              min={1}
              max={60}
              suffix="days"
              hint="After this, the chat closes and no new messages can be sent."
            />
          </Card>
        </section>

        <SubmitButton size="md" className="self-start">
          Save settings
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
