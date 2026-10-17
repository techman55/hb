import { Badge } from "@/components/ui/bits";
import type { ScanReport } from "@/lib/verify/pipeline";
import type { SignalLevel } from "@/lib/verify/metadata";

type Tone = React.ComponentProps<typeof Badge>["tone"];

const LEVEL_TONE: Record<SignalLevel, Tone> = { definitive: "danger", review: "warn", info: "neutral" };

function statusTone(status: string): Tone {
  if (status === "ok") return "success";
  if (status === "error" || status === "quota") return "danger";
  if (status === "retry") return "warn";
  return "neutral";
}

function Section({ title, status, children }: { title: string; status?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {status && <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Everything the pipeline recorded about one photo, laid out for a human reviewer. */
export function ScanReportView({ report }: { report: Partial<ScanReport> | null }) {
  if (!report || !report.verdict) return <p className="text-sm text-muted">No checks have finished for this photo yet.</p>;
  const { metadata, openai, sightengine, google } = report;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Section title="Metadata">
        {metadata ? (
          <>
            <Row label="Format">{metadata.format.toUpperCase()}</Row>
            <Row label="C2PA">{metadata.hasC2pa ? "Manifest present" : "None"}</Row>
            {(metadata.camera.make || metadata.camera.model) && (
              <Row label="Camera">{[metadata.camera.make, metadata.camera.model].filter(Boolean).join(" ")}</Row>
            )}
            {metadata.camera.software && <Row label="Software">{metadata.camera.software}</Row>}
            {metadata.signals.length ? (
              <ul className="mt-1 flex flex-col gap-1.5">
                {metadata.signals.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge tone={LEVEL_TONE[s.level]} className="shrink-0">
                      {s.level}
                    </Badge>
                    <span className="min-w-0">
                      {s.label}
                      {s.evidence && <span className="block truncate font-mono text-xs text-muted">{s.evidence}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Row label="Signals">None found</Row>
            )}
          </>
        ) : (
          <p className="text-muted">Not checked</p>
        )}
      </Section>

      <Section title="OpenAI provenance" status={openai?.status}>
        {!openai ? (
          <p className="text-muted">Not checked</p>
        ) : openai.status === "ok" ? (
          <>
            <Row label="SynthID">{openai.synthid.replace("_", " ")}</Row>
            <Row label="C2PA">
              {openai.c2pa.replace("_", " ")}
              {openai.c2paState && <span className="text-muted"> ({openai.c2paState})</span>}
            </Row>
            {openai.model && <Row label="Model">{openai.model}</Row>}
          </>
        ) : (
          <p className="text-muted">{openai.note}</p>
        )}
      </Section>

      <Section title="Sightengine" status={sightengine?.status}>
        {!sightengine ? (
          <p className="text-muted">Not checked</p>
        ) : sightengine.status === "ok" ? (
          <>
            <Row label="AI score">{pct(sightengine.score)}</Row>
            {sightengine.topGenerators.length > 0 && (
              <Row label="Looks like">
                {sightengine.topGenerators.map((g) => `${g.name} ${pct(g.score)}`).join(", ")}
              </Row>
            )}
          </>
        ) : (
          <p className="text-muted">{sightengine.note}</p>
        )}
      </Section>

      <Section title="Google SynthID" status={google?.status}>
        {!google ? (
          <p className="text-muted">Not checked</p>
        ) : (
          <>
            {google.status === "ok" && <Row label="Watermark">{google.detected ? "Detected" : "Not detected"}</Row>}
            {google.note && <p className="text-muted">{google.note}</p>}
          </>
        )}
      </Section>

      <p className="text-xs text-muted sm:col-span-2">
        Attempt {report.attempts ?? 1}
        {report.checkedAt && ` · checked ${new Date(report.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`}
      </p>
    </div>
  );
}
