import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { Search } from "lucide-react";
import { categoryFollows } from "@/db/schema";
import { CampusToggle, CategoryChips } from "@/components/listing/feed-controls";
import { FollowCategory } from "@/components/listing/follow-category";
import { ListingGrid } from "@/components/listing/listing-card";
import { EmptyState } from "@/components/ui/bits";
import { getUserSchool, requireUser } from "@/lib/auth/current";
import { onlyMyCampus } from "@/lib/campus-pref";
import { categoryName, isCategory } from "@/lib/categories";
import { browseListings } from "@/lib/listings/queries";
import { db } from "@/lib/server";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const category = isCategory(sp.cat) ? sp.cat : null;
  const onlyMine = await onlyMyCampus(sp.campus);
  const [school, results, follows] = await Promise.all([
    getUserSchool(user.schoolId),
    q || category ? browseListings(db(), { id: user.id, schoolId: user.schoolId }, { query: q, category, onlyMyCampus: onlyMine }) : null,
    category
      ? db().select().from(categoryFollows).where(and(eq(categoryFollows.userId, user.id), eq(categoryFollows.category, category))).limit(1)
      : [],
  ]);

  return (
    <div className="flex flex-col gap-5">
      <form action="/search" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          autoFocus={!q && !category}
          placeholder="Search calculators, textbooks, gear…"
          className="h-12 w-full rounded-full border border-line bg-surface pl-12 pr-4 text-base outline-none focus:border-ink"
          enterKeyHint="search"
        />
        {category && <input type="hidden" name="cat" value={category} />}
      </form>

      <CategoryChips active={category} />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {category && (
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{categoryName(category)}</p>
              <FollowCategory category={category} following={follows.length > 0} />
            </div>
          )}
        </div>
        <CampusToggle onlyMine={onlyMine} schoolShortName={school?.shortName ?? "my school"} />
      </div>

      {!results ? (
        <EmptyState title="What are you looking for?" body="Search by name, or pick a category. Try “TI-84”, “lab coat” or “tent”." />
      ) : results.cards.length ? (
        <ListingGrid cards={results.cards} />
      ) : (
        <EmptyState
          title="No matches"
          body={onlyMine ? "Nothing at your school yet. Turn off “Only my college” to search every campus." : "Try a different word or category."}
        />
      )}
    </div>
  );
}
