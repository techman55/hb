import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

// ── Schools & access ─────────────────────────────────────────────

export const schools = sqliteTable("schools", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  primaryDomain: text("primary_domain").notNull(),
  logoKey: text("logo_key"),
  logoSource: text("logo_source"),
  accent: text("accent"),
  lat: real("lat"),
  lng: real("lng"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  autoProvisioned: integer("auto_provisioned", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** Every domain we know about. `edu` and `exception` map to a school; `blocked` never signs in. */
export const schoolDomains = sqliteTable(
  "school_domains",
  {
    domain: text("domain").primaryKey(),
    schoolId: text("school_id"),
    kind: text("kind", { enum: ["edu", "exception", "blocked"] }).notNull(),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("school_domains_school_idx").on(t.schoolId)],
);

/** Read-only directory of known universities (seeded from the Hipo university-domains list). */
export const schoolDirectory = sqliteTable(
  "school_directory",
  {
    domain: text("domain").primaryKey(),
    name: text("name").notNull(),
    country: text("country"),
    state: text("state"),
    webPage: text("web_page"),
  },
  (t) => [index("school_directory_name_idx").on(t.name)],
);

/** Individual addresses let in through an approved appeal. */
export const emailOverrides = sqliteTable("email_overrides", {
  email: text("email").primaryKey(),
  schoolId: text("school_id").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const accessAppeals = sqliteTable(
  "access_appeals",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    schoolName: text("school_name").notNull(),
    schoolId: text("school_id"),
    reason: text("reason").notNull(),
    evidenceKey: text("evidence_key"),
    status: text("status", { enum: ["pending", "approved", "denied"] }).notNull().default("pending"),
    adminNote: text("admin_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("access_appeals_status_idx").on(t.status)],
);

export const meetupSpots = sqliteTable(
  "meetup_spots",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id").notNull(),
    name: text("name").notNull(),
    note: text("note"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("meetup_spots_school_idx").on(t.schoolId)],
);

// ── Users & auth ─────────────────────────────────────────────────

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    schoolId: text("school_id").notNull(),
    name: text("name"),
    avatarKey: text("avatar_key"),
    phone: text("phone").unique(),
    phoneVerifiedAt: ts("phone_verified_at"),
    venmo: text("venmo"),
    cashapp: text("cashapp"),
    /** Opt-in only: texts for dibs requests, handoffs and new chat messages. Needs a verified phone. */
    smsAlerts: integer("sms_alerts", { mode: "boolean" }).notNull().default(false),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    status: text("status", { enum: ["active", "banned"] }).notNull().default("active"),
    friendCode: text("friend_code").notNull().unique(),
    emailVerifiedAt: ts("email_verified_at"),
    onboardedAt: ts("onboarded_at"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [index("users_school_idx").on(t.schoolId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the cookie token. The raw token never touches the database. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginTokens = sqliteTable(
  "login_tokens",
  {
    id: text("id").primaryKey(), // SHA-256 of the link token
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    redirectTo: text("redirect_to"),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("login_tokens_email_idx").on(t.email)],
);

export const smsCodes = sqliteTable(
  "sms_codes",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    userId: text("user_id"),
    purpose: text("purpose", { enum: ["login", "verify"] }).notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sms_codes_phone_idx").on(t.phone)],
);

// ── Social ───────────────────────────────────────────────────────

export const friendships = sqliteTable(
  "friendships",
  {
    id: text("id").primaryKey(),
    requesterId: text("requester_id").notNull(),
    addresseeId: text("addressee_id").notNull(),
    status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
    respondedAt: ts("responded_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("friendships_pair_idx").on(t.requesterId, t.addresseeId),
    index("friendships_addressee_idx").on(t.addresseeId),
  ],
);

export const categoryFollows = sqliteTable(
  "category_follows",
  {
    userId: text("user_id").notNull(),
    category: text("category").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

// ── Listings ─────────────────────────────────────────────────────

export const LISTING_STATUSES = ["drafting", "pending_verification", "active", "paused", "removed"] as const;
export const VISIBILITIES = ["public", "friends", "private"] as const;
export const CONDITIONS = ["new", "like_new", "good", "fair"] as const;

export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    schoolId: text("school_id").notNull(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("other"),
    condition: text("condition", { enum: CONDITIONS }).notNull().default("good"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    included: text("included", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("public"),
    status: text("status", { enum: LISTING_STATUSES }).notNull().default("drafting"),
    priceCents: integer("price_cents").notNull().default(0),
    recommendedPriceCents: integer("recommended_price_cents"),
    priceNote: text("price_note"),
    maxDays: integer("max_days").notNull().default(7),
    aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
    aiBrief: text("ai_brief"),
    views: integer("views").notNull().default(0),
    publishedAt: ts("published_at"),
    updatedAt: ts("updated_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("listings_owner_idx").on(t.ownerId),
    index("listings_feed_idx").on(t.status, t.visibility, t.schoolId, t.publishedAt),
    index("listings_category_idx").on(t.category),
  ],
);

export const SCAN_STATUSES = [
  "none",
  "queued",
  "scanning",
  "passed",
  "flagged",
  "quota_hold",
  "approved",
  "rejected",
  "error",
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const listingPhotos = sqliteTable(
  "listing_photos",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull(),
    ownerId: text("owner_id").notNull(),
    position: integer("position").notNull().default(0),
    source: text("source", { enum: ["camera", "upload"] }).notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull().default(0),
    originalKey: text("original_key").notNull(),
    displayKey: text("display_key"),
    thumbKey: text("thumb_key"),
    width: integer("width"),
    height: integer("height"),
    uploadId: text("upload_id"),
    uploadStatus: text("upload_status", { enum: ["uploading", "uploaded", "failed"] })
      .notNull()
      .default("uploading"),
    scanStatus: text("scan_status", { enum: SCAN_STATUSES }).notNull().default("none"),
    scanScore: real("scan_score"),
    scanReason: text("scan_reason"),
    scanReport: text("scan_report", { mode: "json" }).$type<Record<string, unknown>>(),
    scannedAt: ts("scanned_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("listing_photos_listing_idx").on(t.listingId, t.position),
    index("listing_photos_scan_idx").on(t.scanStatus),
  ],
);

// ── Rentals & chat ───────────────────────────────────────────────

export const RENTAL_STATUSES = [
  "requested",
  "accepted",
  "active",
  "returned",
  "declined",
  "cancelled",
  "expired",
] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const rentals = sqliteTable(
  "rentals",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull(),
    renterId: text("renter_id").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status", { enum: RENTAL_STATUSES }).notNull().default("requested"),
    /** Local calendar date, YYYY-MM-DD. */
    startDate: text("start_date").notNull(),
    days: integer("days").notNull(),
    priceCents: integer("price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    note: text("note"),
    handoffSecret: text("handoff_secret").notNull(),
    respondedAt: ts("responded_at"),
    pickedUpAt: ts("picked_up_at"),
    returnedAt: ts("returned_at"),
    closedAt: ts("closed_at"),
    closedBy: text("closed_by"),
    closedReason: text("closed_reason"),
    pickupReminderAt: ts("pickup_reminder_at"),
    returnReminderAt: ts("return_reminder_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("rentals_listing_idx").on(t.listingId, t.status),
    index("rentals_renter_idx").on(t.renterId, t.status),
    index("rentals_owner_idx").on(t.ownerId, t.status),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    rentalId: text("rental_id").notNull(),
    senderId: text("sender_id"),
    kind: text("kind", { enum: ["text", "system"] }).notNull().default("text"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_rental_idx").on(t.rentalId, t.createdAt)],
);

export const chatReads = sqliteTable(
  "chat_reads",
  {
    rentalId: text("rental_id").notNull(),
    userId: text("user_id").notNull(),
    lastReadAt: ts("last_read_at"),
    lastEmailedAt: ts("last_emailed_at"),
  },
  (t) => [primaryKey({ columns: [t.rentalId, t.userId] })],
);

// ── Ops ──────────────────────────────────────────────────────────

/** Counters for metered third-party APIs, keyed by `day:YYYY-MM-DD` or `month:YYYY-MM`. */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    provider: text("provider").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.period] })],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  listingId: text("listing_id"),
  userId: text("user_id"),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  createdAt: createdAt(),
});

export type School = typeof schools.$inferSelect;
export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type ListingPhoto = typeof listingPhotos.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
export type Message = typeof messages.$inferSelect;
