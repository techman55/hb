import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, or, sql } from "drizzle-orm";
import { ChevronRight, GraduationCap } from "lucide-react";
import { schools } from "@/db/schema";
import { SchoolLogo } from "@/components/school-chip";
import { Badge, Card, EmptyState } from "@/components/ui/bits";
import { Hint, Input, Label } from "@/components/ui/field";
import { contains, param } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { toPublicSchool } from "@/lib/schools/service";
import { db } from "@/lib/server";
import { plural } from "@/lib/utils";
import { ActionForm, SubmitButton } from "../_components/action-controls";
import { PageHeader, SearchBar } from "../_components/ui";
import { addCampus } from "../actions";

export const metadata: Metadata = { title: "Schools" };

export default async function SchoolsPage({ searchParams }: PageProps<"/admin/schools">) {
  await requireAdmin();
  const q = param((await searchParams).q);
  const rows = await db()
    .select({
      school: schools,
      // Spelled out: drizzle leaves single-table columns unqualified, which a subquery would misread.
      users: sql<number>`(SELECT COUNT(*) FROM users u WHERE u.school_id = schools.id)`,
      listings: sql<number>`(SELECT COUNT(*) FROM listings l WHERE l.school_id = schools.id AND l.status != 'removed')`,
    })
    .from(schools)
    .where(q ? or(contains(schools.name, q), contains(schools.primaryDomain, q), contains(schools.slug, q)) : undefined)
    .orderBy(desc(schools.enabled), asc(schools.name))
    .limit(200);

  return (
    <div>
      <PageHeader title="Schools" description="Campuses on Dibs. Most are created automatically the first time a student signs in." />

      <Card className="mb-6 p-4 sm:p-5">
        <ActionForm action={addCampus} resetOnSuccess className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="campus-domain">Add a campus</Label>
            <Input id="campus-domain" name="domain" placeholder="mines.edu" autoCapitalize="none" spellCheck={false} required />
          </div>
          <SubmitButton size="md" className="sm:mb-px">
            Add campus
          </SubmitButton>
        </ActionForm>
        <Hint>We look the name up in the school directory and fetch the logo and colors.</Hint>
      </Card>

      <div className="mb-4">
        <SearchBar placeholder="Search schools" defaultValue={q} />
      </div>

      {rows.length ? (
        <Card className="divide-y divide-line">
          {rows.map(({ school, users, listings }) => (
            <Link
              key={school.id}
              href={`/admin/schools/${school.id}`}
              className="flex items-center gap-3 px-4 py-3 transition first:rounded-t-3xl last:rounded-b-3xl hover:bg-surface-2/50 sm:px-5"
            >
              <SchoolLogo school={toPublicSchool(school)} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  <span className="truncate">{school.name}</span>
                  {!school.enabled && <Badge tone="danger">Off</Badge>}
                  {school.autoProvisioned && <Badge tone="neutral">Auto</Badge>}
                </p>
                <p className="truncate text-sm text-muted">
                  {[school.shortName, school.slug, school.primaryDomain].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted">
                  {plural(users, "user")} · {plural(listings, "listing")}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<GraduationCap className="size-6" />}
          title={q ? "No schools match" : "No schools yet"}
          body={q ? "Try a different name or domain." : "Add one above, or wait for the first student to sign in."}
        />
      )}
    </div>
  );
}
