import type { Metadata } from "next";
import { asc, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Inbox, Paperclip } from "lucide-react";
import { accessAppeals, schools, users } from "@/db/schema";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui/bits";
import { isPublicMailDomain } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { emailDomain } from "@/lib/schools/domains";
import { db } from "@/lib/server";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "../_components/ui";
import { AppealDecision } from "./appeal-decision";

export const metadata: Metadata = { title: "Appeals" };

type Appeal = typeof accessAppeals.$inferSelect;

function AppealDetails({ appeal, schoolName }: { appeal: Appeal; schoolName: string | null }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{appeal.name}</p>
          <p className="break-all text-sm text-muted">{appeal.email}</p>
        </div>
        <span className="shrink-0 text-xs text-muted">{timeAgo(appeal.createdAt)}</span>
      </div>
      <p className="text-sm">
        <span className="text-muted">School: </span>
        {appeal.schoolName}
        {schoolName && schoolName !== appeal.schoolName && <span className="text-muted"> (on Dibs as {schoolName})</span>}
      </p>
      <p className="whitespace-pre-line rounded-2xl bg-surface-2 px-3 py-2 text-sm">{appeal.reason}</p>
      {appeal.evidenceKey ? (
        <a
          href={`/admin/appeals/${appeal.id}/evidence`}
          target="_blank"
          rel="noopener"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
        >
          <Paperclip className="size-4" /> View proof
        </a>
      ) : (
        <p className="text-sm text-muted">No proof attached</p>
      )}
    </>
  );
}

export default async function AppealsPage() {
  await requireAdmin();
  const d = db();
  const reviewer = alias(users, "reviewer");

  const [pending, decided, schoolRows] = await Promise.all([
    d
      .select({ appeal: accessAppeals, schoolName: schools.name })
      .from(accessAppeals)
      .leftJoin(schools, eq(schools.id, accessAppeals.schoolId))
      .where(eq(accessAppeals.status, "pending"))
      .orderBy(asc(accessAppeals.createdAt)),
    d
      .select({ appeal: accessAppeals, schoolName: schools.name, reviewerName: reviewer.name, reviewerEmail: reviewer.email })
      .from(accessAppeals)
      .leftJoin(schools, eq(schools.id, accessAppeals.schoolId))
      .leftJoin(reviewer, eq(reviewer.id, accessAppeals.reviewedBy))
      .where(ne(accessAppeals.status, "pending"))
      .orderBy(desc(accessAppeals.reviewedAt))
      .limit(50),
    d
      .select({ id: schools.id, name: schools.name, domain: schools.primaryDomain, enabled: schools.enabled })
      .from(schools)
      .orderBy(asc(schools.name)),
  ]);

  return (
    <div>
      <PageHeader
        title="Appeals"
        description="People without a .edu email asking to join. Approving lets that one address sign in as a student of the school you pick."
      />

      <section>
        <SectionTitle count={pending.length}>Waiting</SectionTitle>
        {pending.length ? (
          <div className="flex flex-col gap-3">
            {pending.map(({ appeal, schoolName }) => {
              const domain = emailDomain(appeal.email);
              return (
                <Card key={appeal.id} className="flex flex-col gap-3 p-4 sm:p-5">
                  <AppealDetails appeal={appeal} schoolName={schoolName} />
                  <AppealDecision
                    appealId={appeal.id}
                    emailDomain={domain}
                    publicDomain={domain ? isPublicMailDomain(domain) : true}
                    suggestedSchoolId={appeal.schoolId}
                    schools={schoolRows}
                  />
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Inbox className="size-6" />} title="No requests waiting" body="New access requests show up here." />
        )}
      </section>

      <section className="mt-10">
        <SectionTitle>Decided</SectionTitle>
        {decided.length ? (
          <div className="flex flex-col gap-3">
            {decided.map(({ appeal, schoolName, reviewerName, reviewerEmail }) => (
              <Card key={appeal.id} className="flex flex-col gap-3 p-4 sm:p-5">
                <AppealDetails appeal={appeal} schoolName={appeal.status === "approved" ? null : schoolName} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={appeal.status === "approved" ? "success" : "danger"}>
                    {appeal.status === "approved" ? `Approved${schoolName ? ` for ${schoolName}` : ""}` : "Denied"}
                  </Badge>
                  <span>
                    by {reviewerName ?? reviewerEmail ?? "an admin"}
                    {appeal.reviewedAt && ` · ${timeAgo(appeal.reviewedAt)}`}
                  </span>
                </div>
                {appeal.adminNote && <p className="text-sm text-muted">Note: {appeal.adminNote}</p>}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing decided yet" body="Approved and denied requests are listed here." />
        )}
      </section>
    </div>
  );
}
