import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Trash } from "lucide-react";
import { schoolDomains, schools } from "@/db/schema";
import { Card, EmptyState, SectionTitle } from "@/components/ui/bits";
import { Hint, Input, Label } from "@/components/ui/field";
import { requireAdmin } from "@/lib/auth/current";
import { db } from "@/lib/server";
import { ActionButton, ActionForm, SubmitButton } from "../_components/action-controls";
import { PageHeader, SelectField, formatDate } from "../_components/ui";
import { addDomain, deleteDomain } from "../actions";

export const metadata: Metadata = { title: "Domains" };

type Row = { domain: string; kind: "edu" | "exception" | "blocked"; note: string | null; createdAt: Date; schoolName: string | null };

function DomainList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <Card className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.domain} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="break-all font-semibold">{r.domain}</p>
            <p className="text-sm text-muted">
              {[r.schoolName, r.note, `added ${formatDate(r.createdAt)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ActionButton
            action={deleteDomain.bind(null, r.domain)}
            confirm={`Remove ${r.domain}?`}
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${r.domain}`}
          >
            <Trash className="size-4" />
          </ActionButton>
        </div>
      ))}
    </Card>
  );
}

export default async function DomainsPage() {
  await requireAdmin();
  const d = db();
  const [rows, schoolRows] = await Promise.all([
    d
      .select({
        domain: schoolDomains.domain,
        kind: schoolDomains.kind,
        note: schoolDomains.note,
        createdAt: schoolDomains.createdAt,
        schoolName: schools.name,
      })
      .from(schoolDomains)
      .leftJoin(schools, eq(schools.id, schoolDomains.schoolId))
      .orderBy(asc(schoolDomains.domain)),
    d.select({ id: schools.id, name: schools.name }).from(schools).orderBy(asc(schools.name)),
  ]);
  const exceptions = rows.filter((r) => r.kind === "exception");
  const blocked = rows.filter((r) => r.kind === "blocked");
  const edu = rows.filter((r) => r.kind === "edu");

  return (
    <div>
      <PageHeader
        title="Domains"
        description="Which email domains can sign in. School .edu domains are added on their own. Exceptions let a non-.edu domain in as a school; blocked domains can never sign in, even under an allowed school (like alumni.ua.edu)."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="font-bold tracking-tight">Add an exception</h2>
          <ActionForm action={addDomain} resetOnSuccess className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="kind" value="exception" />
            <div>
              <Label htmlFor="exception-domain">Domain</Label>
              <Input id="exception-domain" name="domain" placeholder="college.org" autoCapitalize="none" spellCheck={false} required />
            </div>
            <div>
              <Label htmlFor="exception-school">School</Label>
              <SelectField id="exception-school" name="schoolId" defaultValue="" required>
                <option value="" disabled>
                  Choose a school…
                </option>
                {schoolRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div>
              <Label htmlFor="exception-note">Note (optional)</Label>
              <Input id="exception-note" name="note" maxLength={200} placeholder="Student email for the nursing college" />
            </div>
            <SubmitButton className="self-start">Add exception</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="font-bold tracking-tight">Block a domain</h2>
          <ActionForm action={addDomain} resetOnSuccess className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="kind" value="blocked" />
            <div>
              <Label htmlFor="blocked-domain">Domain</Label>
              <Input id="blocked-domain" name="domain" placeholder="alumni.school.edu" autoCapitalize="none" spellCheck={false} required />
              <Hint>Subdomains of an allowed school can be blocked on their own.</Hint>
            </div>
            <div>
              <Label htmlFor="blocked-note">Note (optional)</Label>
              <Input id="blocked-note" name="note" maxLength={200} placeholder="Alumni addresses" />
            </div>
            <SubmitButton variant="secondary" className="self-start">
              Block domain
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section className="mt-10">
        <SectionTitle count={exceptions.length}>Exceptions</SectionTitle>
        <DomainList rows={exceptions} empty="No exceptions yet" />
      </section>

      <section className="mt-8">
        <SectionTitle count={blocked.length}>Blocked</SectionTitle>
        <DomainList rows={blocked} empty="Nothing blocked" />
      </section>

      <details className="group mt-8">
        <summary className="cursor-pointer select-none text-[17px] font-bold tracking-tight">
          School domains <span className="ml-1 text-sm font-semibold text-muted">{edu.length}</span>
        </summary>
        <div className="mt-3">
          <p className="mb-3 text-sm text-muted">Added when a school is created. Turn a school off or block a subdomain to limit them.</p>
          {edu.length ? (
            <Card className="divide-y divide-line">
              {edu.map((r) => (
                <div key={r.domain} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="break-all font-medium">{r.domain}</span>
                  <span className="text-muted">{r.schoolName ?? "No school"}</span>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title="No school domains yet" body="They're added the first time someone from a school signs in." />
          )}
        </div>
      </details>
    </div>
  );
}
