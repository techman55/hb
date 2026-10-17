-- Full-text search over listings (external-content FTS5 kept in sync by triggers).
CREATE VIRTUAL TABLE `listings_fts` USING fts5(
  title,
  description,
  tags,
  content='listings',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `listings_fts_ai` AFTER INSERT ON `listings` BEGIN
  INSERT INTO listings_fts(rowid, title, description, tags) VALUES (new.rowid, new.title, new.description, new.tags);
END;
--> statement-breakpoint
CREATE TRIGGER `listings_fts_ad` AFTER DELETE ON `listings` BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, tags) VALUES ('delete', old.rowid, old.title, old.description, old.tags);
END;
--> statement-breakpoint
CREATE TRIGGER `listings_fts_au` AFTER UPDATE OF title, description, tags ON `listings` BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, tags) VALUES ('delete', old.rowid, old.title, old.description, old.tags);
  INSERT INTO listings_fts(rowid, title, description, tags) VALUES (new.rowid, new.title, new.description, new.tags);
END;
--> statement-breakpoint
-- Launch campus: The University of Alabama. Students sign in with @crimson.ua.edu, staff with @ua.edu.
INSERT INTO `schools` (`id`, `slug`, `name`, `short_name`, `primary_domain`, `accent`, `lat`, `lng`, `enabled`, `auto_provisioned`)
VALUES ('sch_ua', 'ua', 'The University of Alabama', 'Alabama', 'ua.edu', '#9E1B32', 33.2140, -87.5391, 1, 0);
--> statement-breakpoint
INSERT INTO `school_domains` (`domain`, `school_id`, `kind`, `note`) VALUES
  ('ua.edu', 'sch_ua', 'edu', 'Launch campus'),
  ('crimson.ua.edu', 'sch_ua', 'edu', 'Student email');
--> statement-breakpoint
INSERT INTO `meetup_spots` (`id`, `school_id`, `name`, `note`, `position`) VALUES
  ('spot_ua_1', 'sch_ua', 'Gorgas Library', 'Front steps on the Quad', 0),
  ('spot_ua_2', 'sch_ua', 'Ferguson Student Center', 'Main entrance', 1),
  ('spot_ua_3', 'sch_ua', 'Rodgers Library', 'Lobby', 2),
  ('spot_ua_4', 'sch_ua', 'Lakeside Dining', 'Outside the doors', 3),
  ('spot_ua_5', 'sch_ua', 'Student Rec Center', 'Front desk', 4);
