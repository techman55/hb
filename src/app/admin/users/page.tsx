import type { Metadata } from "next";
import { and, desc, eq, or } from "drizzle-orm";
import { Users } from "lucide-react";
import { schools, users } from "@/db/schema";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui/bits";
import { contains, param } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/current";
import { adminEmails } from "@/lib/env";
import { db, env } from "@/lib/server";
import { ActionButton } from "../_components/action-controls";
import { FilterChips, PageHeader, SearchBar, formatDate } from "../_components/ui";
import { setUserRole, setUserStatus } from "../actions";

export const metadata: Metadata = { title: "Users" };

const FILTERS = [
  { key: "", label: "Everyone" },
  { key: "admin", label: "Admins" },
  { key: "banned", label: "Banned" },
] as const;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q);
  const filter = FILTERS.find((f) => f.key === param(sp.filter))?.key ?? "";
  const envAdmins = adminEmails(env());

  const rows = await db()
    .select({ user: users, schoolName: schools.shortName })
    .from(users)
    .leftJoin(schools, eq(schools.id, users.schoolId))
    .where(
      and(
        q ? or(contains(users.email, q), contains(users.name, q)) : undefined,
        filter === "admin" ? eq(users.role, "admin") : filter === "banned" ? eq(users.status, "banned") : undefined,
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(50);

  const href = (f: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f) p.set("filter", f);
    const s = p.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <div>
      <PageHeader title="Users" description="Banning signs someone out everywhere and pauses their listings." />
      <div className="mb-5 flex flex-col gap-3">
        <SearchBar placeholder="Search by name or email" defaultValue={q} hidden={{ filter: filter || undefined }} />
        <FilterChips items={FILTERS.map((f) => ({ href: href(f.key), label: f.label, active: filter === f.key }))} />
      </div>

      {rows.length ? (
        <Card className="divide-y divide-line">
          {rows.map(({ user: u, schoolName }) => {
            const isMe = u.id === me.id;
            const fromEnv = envAdmins.includes(u.email);
            return (
              <div key={u.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={u.name} email={u.email} size={40} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold">{u.name ?? "No name yet"}</span>
                      {isMe && <Badge tone="neutral">You</Badge>}
                      {u.role === "admin" && <Badge tone="ink">Admin</Badge>}
                      {u.status === "banned" && <Badge tone="danger">Banned</Badge>}
                      {!u.onboardedAt && <Badge tone="warn">Not onboarded</Badge>}
                    </p>
                    <p className="break-all text-sm text-muted">{u.email}</p>
                    <p className="text-xs text-muted">
                      {[schoolName, `joined ${formatDate(u.createdAt)}`].filter(Boolean).join(" · ")}
                      {fromEnv && " · admin via ADMIN_EMAILS"}
                    </p>
                  </div>
                </div>
                {!isMe && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {u.status === "banned" ? (
                      <ActionButton action={setUserStatus.bind(null, u.id, "active")} confirm={`Unban ${u.email}?`}>
                        Unban
                      </ActionButton>
                    ) : (
                      <ActionButton
                        action={setUserStatus.bind(null, u.id, "banned")}
                        confirm={`Ban ${u.email}? They'll be signed out and their listings paused.`}
                        variant="danger"
                      >
                        Ban
                      </ActionButton>
                    )}
                    {u.role === "admin" ? (
                      !fromEnv && (
                        <ActionButton action={setUserRole.bind(null, u.id, "user")} confirm={`Remove admin access from ${u.email}?`} variant="ghost">
                          Remove admin
                        </ActionButton>
                      )
                    ) : (
                      <ActionButton action={setUserRole.bind(null, u.id, "admin")} confirm={`Make ${u.email} an admin?`} variant="ghost">
                        Make admin
                      </ActionButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title={q || filter ? "No one matches" : "No users yet"}
          body={q || filter ? "Try a different name, email or filter." : "People show up here after they sign in."}
        />
      )}
      {rows.length === 50 && <p className="mt-3 text-center text-xs text-muted">Showing the 50 newest matches. Search to narrow it down.</p>}
    </div>
  );
}
