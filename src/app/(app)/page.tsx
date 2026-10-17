import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { categoryFollows } from "@/db/schema";
import { CampusToggle, CategoryChips, FeedTabs } from "@/components/listing/feed-controls";
import { FollowCategory } from "@/components/listing/follow-category";
import { ListingGrid } from "@/components/listing/listing-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/bits";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { onlyMyCampus } from "@/lib/campus-pref";
import { categoryName, isCategory } from "@/lib/categories";
import { followingFeed, forYouFeed } from "@/lib/listings/queries";
import { db } from "@/lib/server";
import { firstName } from "@/lib/utils";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "following" ? "following" : "foryou";
  const category = isCategory(sp.cat) ? sp.cat : null;
  const onlyMine = await onlyMyCampus(sp.campus);
  const school = await getUserSchool(user.schoolId);
  const viewer = { id: user.id, schoolId: user.schoolId };

  const followingCategory = category
    ? (await db().select().from(categoryFollows).where(and(eq(categoryFollows.userId, user.id), eq(categoryFollows.category, category))).limit(1)).length > 0
    : false;

  const cards =
    tab === "foryou"
      ? await forYouFeed(db(), viewer, { onlyMyCampus: onlyMine, category })
      : (await followingFeed(db(), viewer, { onlyMyCampus: onlyMine })).cards.filter((c) => !category || c.category === category);

  return (
    <div className="flex flex-col gap-5">
      <div className="hidden lg:block">
        <p className="text-sm text-muted">Hey {firstName(user.name)}</p>
        <h1 className="text-3xl font-bold tracking-tight">What do you need?</h1>
      </div>

      <Link
        href="/search"
        className="flex h-12 items-center gap-3 rounded-full bg-surface px-4 text-muted ring-1 ring-line transition hover:ring-ink/30"
      >
        <Search className="size-5" />
        <span>Search calculators, textbooks, gear…</span>
      </Link>

      <CategoryChips active={category} />

      {category && (
        <div className="-mt-2 flex items-center gap-2">
          <p className="text-sm text-muted">Get {categoryName(category).toLowerCase()} in your Following feed</p>
          <FollowCategory category={category} following={followingCategory} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <FeedTabs tab={tab} />
        <CampusToggle onlyMine={onlyMine} schoolShortName={school?.shortName ?? "my school"} />
      </div>

      {cards.length ? (
        <ListingGrid cards={cards} />
      ) : tab === "following" ? (
        <EmptyState
          title="Nothing here yet"
          body="Friends' listings and categories you follow show up here. Follow a category from its chip, or add friends from your profile."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/me#friends">Find friends</Link>
            </Button>
          }
        />
      ) : (
        <EmptyState
          title={onlyMine ? "Your campus is just getting started" : "No listings yet"}
          body={
            onlyMine
              ? "Be one of the first to list something, or turn off “Only my college” to see other schools."
              : "Be the first to list something people can rent."
          }
          action={
            <Button asChild size="sm">
              <Link href="/lending/new">
                <Plus className="size-4" /> List something
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
