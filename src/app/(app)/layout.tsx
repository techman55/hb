import { BottomNav, SideNav, TopBar } from "@/components/shell/nav";
import { LiveUpdates } from "@/components/shell/live-updates";
import { RightRail } from "@/components/shell/right-rail";
import { UnreadProvider } from "@/components/shell/unread";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { db } from "@/lib/server";
import { shellData } from "@/lib/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [school, shell] = await Promise.all([getUserSchool(user.schoolId), shellData(db(), user.id)]);
  const navUser = { name: user.name, email: user.email, isAdmin: user.role === "admin" };
  const schoolLike = school ?? { name: "Your school", shortName: "—", logoUrl: null, accent: null };

  return (
    <UnreadProvider unread={shell.unread} friendRequests={shell.friendRequests}>
      <div className="min-h-dvh">
        <SideNav user={navUser} school={schoolLike} badges={{ dibs: shell.dibs, lending: shell.lending }} />
        <div className="lg:pl-64 xl:pr-80">
          <TopBar school={schoolLike} />
          <main className="mx-auto w-full max-w-[680px] px-4 pb-32 pt-4 lg:px-6 lg:pb-16 lg:pt-8">{children}</main>
        </div>
        <RightRail upcoming={shell.upcoming} friendRequests={shell.friendRequests} />
        <BottomNav user={navUser} badges={{ dibs: shell.dibs, lending: shell.lending }} />
        <LiveUpdates />
      </div>
    </UnreadProvider>
  );
}
