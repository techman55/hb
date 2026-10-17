export const CATEGORIES = [
  { slug: "calculators", name: "Calculators" },
  { slug: "textbooks", name: "Textbooks" },
  { slug: "electronics", name: "Electronics" },
  { slug: "lab-gear", name: "Lab & safety gear" },
  { slug: "dorm", name: "Dorm & home" },
  { slug: "formal", name: "Formal wear & cap/gown" },
  { slug: "outdoors", name: "Sports & outdoors" },
  { slug: "cameras", name: "Cameras & audio" },
  { slug: "instruments", name: "Instruments" },
  { slug: "tools", name: "Tools" },
  { slug: "gaming", name: "Gaming" },
  { slug: "events", name: "Party & events" },
  { slug: "other", name: "Other" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

export function categoryName(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? "Other";
}

export function isCategory(slug: unknown): slug is CategorySlug {
  return typeof slug === "string" && CATEGORIES.some((c) => c.slug === slug);
}

export const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
};
