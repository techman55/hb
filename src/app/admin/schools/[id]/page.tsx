import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowLeft, MapPin, RotateCw, Trash } from "lucide-react";
import { meetupSpots, schoolDomains, schools } from "@/db/schema";
import { SchoolLogo } from "@/components/school-chip";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui/bits";
import { Hint, Input, Label } from "@/components/ui/field";
import { requireAdmin } from "@/lib/auth/current";
import { acronym } from "@/lib/schools/domains";
import { toPublicSchool } from "@/lib/schools/service";
import { db } from "@/lib/server";
import { plural } from "@/lib/utils";
import { ActionButton, ActionForm, SubmitButton } from "../../_components/action-controls";
import { addMeetupSpot, deleteMeetupSpot, refetchSchoolLogo, updateMeetupSpot, updateSchool, uploadSchoolLogo } from "../../actions";
import { SchoolForm } from "./school-form";

export async function generateMetadata({ params }: PageProps<"/admin/schools/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = (await db().select({ name: schools.name }).from(schools).where(eq(schools.id, id)).limit(1))[0];
  return { title: row?.name ?? "School" };
}

const LOGO_SOURCES: Record<string, string> = {
  wikidata: "Wikidata",
  homepage: "the school's website",
  favicon: "its favicon",
  admin: "an admin upload",
  none: "an earlier fetch",
};

const KIND_TONE = { edu: "neutral", exception: "accent", blocked: "danger" } as const;

export default async function SchoolPage({ params }: PageProps<"/admin/schools/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const d = db();
  const school = (await d.select().from(schools).where(eq(schools.id, id)).limit(1))[0];
  if (!school) notFound();

  const [spots, domains, [stats]] = await Promise.all([
    d.select().from(meetupSpots).where(eq(meetupSpots.schoolId, id)).orderBy(asc(meetupSpots.position), asc(meetupSpots.name)),
    d.select().from(schoolDomains).where(eq(schoolDomains.schoolId, id)).orderBy(asc(schoolDomains.domain)),
    d.all<{ users: number; listings: number }>(sql`
      SELECT
        (SELECT COUNT(*) FROM users WHERE school_id = ${id}) AS users,
        (SELECT COUNT(*) FROM listings WHERE school_id = ${id} AND status != 'removed') AS listings`),
  ]);
  const pub = toPublicSchool(school);

  return (
    <div>
      <Link
        href="/admin/schools"
        className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2"
      >
        <ArrowLeft className="size-4" /> All schools
      </Link>
      <div className="mb-6 flex items-center gap-4">
        <SchoolLogo school={pub} size={56} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{school.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{school.primaryDomain}</span>
            <span>·</span>
            <span>
              {plural(stats?.users ?? 0, "user")}, {plural(stats?.listings ?? 0, "listing")}
            </span>
            {!school.enabled && <Badge tone="danger">Off</Badge>}
            {school.autoProvisioned && <Badge tone="neutral">Auto-created</Badge>}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <section>
          <SectionTitle>Details</SectionTitle>
          <Card className="p-4 sm:p-5">
            <SchoolForm
              action={updateSchool.bind(null, school.id)}
              school={{
                name: school.name,
                shortName: school.shortName,
                accent: school.accent,
                enabled: school.enabled,
                acronym: acronym(school.name),
              }}
            />
          </Card>
        </section>

        <section>
          <SectionTitle>Logo</SectionTitle>
          <Card className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <SchoolLogo school={pub} size={64} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {school.logoKey
                    ? `From ${LOGO_SOURCES[school.logoSource ?? ""] ?? school.logoSource ?? "an unknown source"}`
                    : "No logo yet, so the monogram is shown."}
                </p>
                <p className="text-xs text-muted">Re-fetching checks Wikidata, then the school&apos;s website, then its favicon.</p>
              </div>
              <ActionButton action={refetchSchoolLogo.bind(null, school.id)}>
                <RotateCw className="size-4" /> Re-fetch logo
              </ActionButton>
            </div>
            <ActionForm action={uploadSchoolLogo.bind(null, school.id)} resetOnSuccess className="flex flex-col gap-2">
              <Label htmlFor="logo-file">Upload a logo</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  id="logo-file"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  required
                  className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
                />
                <SubmitButton variant="secondary" className="self-start">
                  Upload
                </SubmitButton>
              </div>
              <Hint>Square PNG, JPG, WebP or GIF up to 1 MB. Replaces the current logo.</Hint>
            </ActionForm>
          </Card>
        </section>

        <section>
          <SectionTitle count={spots.length}>Meetup spots</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-muted">
            Suggested in chat when people pick a place to hand things off. Lower positions show first.
          </p>
          {spots.length ? (
            <Card className="divide-y divide-line">
              {spots.map((spot) => (
                <div key={spot.id} className="flex items-start gap-2 p-4 sm:px-5">
                  <ActionForm
                    action={updateMeetupSpot.bind(null, spot.id)}
                    className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_auto] sm:items-center"
                  >
                    <Input name="name" defaultValue={spot.name} aria-label="Spot name" maxLength={60} required className="h-10" />
                    <Input name="note" defaultValue={spot.note ?? ""} aria-label="Note" placeholder="Note" maxLength={120} className="h-10" />
                    <Input
                      name="position"
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={spot.position}
                      aria-label="Position"
                      className="h-10"
                    />
                    <SubmitButton variant="secondary" className="justify-self-start">
                      Save
                    </SubmitButton>
                  </ActionForm>
                  <ActionButton
                    action={deleteMeetupSpot.bind(null, spot.id)}
                    confirm={`Remove ${spot.name}?`}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${spot.name}`}
                    className="mt-0.5"
                  >
                    <Trash className="size-4" />
                  </ActionButton>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState icon={<MapPin className="size-6" />} title="No meetup spots yet" body="Add a few well-known, public places on campus." />
          )}
          <Card className="mt-3 p-4 sm:px-5">
            <ActionForm
              action={addMeetupSpot.bind(null, school.id)}
              resetOnSuccess
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_auto] sm:items-center"
            >
              <Input name="name" placeholder="Main library" aria-label="New spot name" maxLength={60} required className="h-10" />
              <Input name="note" placeholder="Front steps" aria-label="New spot note" maxLength={120} className="h-10" />
              <Input name="position" type="number" min={0} max={999} placeholder="Pos." aria-label="New spot position" className="h-10" />
              <SubmitButton className="justify-self-start">Add spot</SubmitButton>
            </ActionForm>
          </Card>
        </section>

        <section>
          <SectionTitle action={<Link href="/admin/domains" className="text-sm text-muted hover:text-ink">Manage</Link>}>
            Email domains
          </SectionTitle>
          {domains.length ? (
            <Card className="divide-y divide-line">
              {domains.map((dom) => (
                <div key={dom.domain} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="break-all font-medium">{dom.domain}</span>
                  <Badge tone={KIND_TONE[dom.kind]}>{dom.kind}</Badge>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title="No domains" body="Nobody can sign in to this school by domain. Add an exception or approve appeals." />
          )}
        </section>
      </div>
    </div>
  );
}
