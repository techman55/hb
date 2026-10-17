import { z } from "zod";
import { CONDITIONS, VISIBILITIES } from "@/db/schema";
import { CATEGORY_SLUGS } from "@/lib/categories";

export const DetailsSchema = z.object({
  title: z.string().trim().min(3, "Add a title.").max(60, "Keep the title under 60 characters."),
  description: z.string().trim().max(600, "Keep the description under 600 characters."),
  category: z.enum(CATEGORY_SLUGS),
  condition: z.enum(CONDITIONS),
  tags: z.array(z.string().trim().min(1).max(24)).max(6),
  included: z.array(z.string().trim().min(1).max(40)).max(5),
});

export const PublishSchema = z.object({
  visibility: z.enum(VISIBILITIES),
  priceCents: z.number().int().min(100, "Minimum is $1/day.").max(10_000, "Maximum is $100/day."),
  maxDays: z.number().int().min(1).max(30),
});

export type ListingDetails = z.infer<typeof DetailsSchema>;
