import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current";
import { db } from "@/lib/server";
import { AdminSideNav, AdminTopBar, type AdminCounts } from "./_components/admin-nav";

export const metadata: Metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const counts =
    (
      await db().all<AdminCounts>(sql`
        SELECT
          (SELECT COUNT(*) FROM listing_photos WHERE scan_status IN ('flagged', 'quota_hold') AND upload_status = 'uploaded') AS photos,
          (SELECT COUNT(*) FROM access_appeals WHERE status = 'pending') AS appeals`)
    )[0] ?? { photos: 0, appeals: 0 };

  return (
    <div className="min-h-dvh">
      <AdminSideNav counts={counts} />
      <div className="lg:pl-60">
        <AdminTopBar counts={counts} />
        <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-5 lg:px-8 lg:pt-10">{children}</main>
      </div>
    </div>
  );
}
