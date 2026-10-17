CREATE TABLE `access_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`school_name` text NOT NULL,
	`school_id` text,
	`reason` text NOT NULL,
	`evidence_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_appeals_status_idx` ON `access_appeals` (`status`);--> statement-breakpoint
CREATE TABLE `api_usage` (
	`provider` text NOT NULL,
	`period` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`provider`, `period`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `category_follows` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `category`)
);
--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`rental_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` integer,
	`last_emailed_at` integer,
	PRIMARY KEY(`rental_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `email_overrides` (
	`email` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`addressee_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`responded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pair_idx` ON `friendships` (`requester_id`,`addressee_id`);--> statement-breakpoint
CREATE INDEX `friendships_addressee_idx` ON `friendships` (`addressee_id`);--> statement-breakpoint
CREATE TABLE `listing_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`original_key` text NOT NULL,
	`display_key` text,
	`thumb_key` text,
	`width` integer,
	`height` integer,
	`upload_id` text,
	`upload_status` text DEFAULT 'uploading' NOT NULL,
	`scan_status` text DEFAULT 'none' NOT NULL,
	`scan_score` real,
	`scan_reason` text,
	`scan_report` text,
	`scanned_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listing_photos_listing_idx` ON `listing_photos` (`listing_id`,`position`);--> statement-breakpoint
CREATE INDEX `listing_photos_scan_idx` ON `listing_photos` (`scan_status`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`school_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`included` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'drafting' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`recommended_price_cents` integer,
	`price_note` text,
	`max_days` integer DEFAULT 7 NOT NULL,
	`ai_generated` integer DEFAULT false NOT NULL,
	`ai_brief` text,
	`views` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`updated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listings_owner_idx` ON `listings` (`owner_id`);--> statement-breakpoint
CREATE INDEX `listings_feed_idx` ON `listings` (`status`,`visibility`,`school_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `listings_category_idx` ON `listings` (`category`);--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`redirect_to` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_tokens_email_idx` ON `login_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `meetup_spots` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meetup_spots_school_idx` ON `meetup_spots` (`school_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`sender_id` text,
	`kind` text DEFAULT 'text' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_rental_idx` ON `messages` (`rental_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`renter_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`start_date` text NOT NULL,
	`days` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`note` text,
	`handoff_secret` text NOT NULL,
	`responded_at` integer,
	`picked_up_at` integer,
	`returned_at` integer,
	`closed_at` integer,
	`closed_by` text,
	`closed_reason` text,
	`pickup_reminder_at` integer,
	`return_reminder_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rentals_listing_idx` ON `rentals` (`listing_id`,`status`);--> statement-breakpoint
CREATE INDEX `rentals_renter_idx` ON `rentals` (`renter_id`,`status`);--> statement-breakpoint
CREATE INDEX `rentals_owner_idx` ON `rentals` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`listing_id` text,
	`user_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_directory` (
	`domain` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`state` text,
	`web_page` text
);
--> statement-breakpoint
CREATE INDEX `school_directory_name_idx` ON `school_directory` (`name`);--> statement-breakpoint
CREATE TABLE `school_domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`school_id` text,
	`kind` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `school_domains_school_idx` ON `school_domains` (`school_id`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`primary_domain` text NOT NULL,
	`logo_key` text,
	`logo_source` text,
	`accent` text,
	`lat` real,
	`lng` real,
	`enabled` integer DEFAULT true NOT NULL,
	`auto_provisioned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_slug_unique` ON `schools` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`user_id` text,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sms_codes_phone_idx` ON `sms_codes` (`phone`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`school_id` text NOT NULL,
	`name` text,
	`avatar_key` text,
	`phone` text,
	`phone_verified_at` integer,
	`venmo` text,
	`cashapp` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`friend_code` text NOT NULL,
	`email_verified_at` integer,
	`onboarded_at` integer,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_friend_code_unique` ON `users` (`friend_code`);--> statement-breakpoint
CREATE INDEX `users_school_idx` ON `users` (`school_id`);