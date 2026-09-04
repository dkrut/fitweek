-- Supplements are part of the weekly plan, same as dishes and workouts: which
-- supplement belongs to which day is defined by plan_entry.

-- 1. supplement_log gains a snapshot of the name and the dose, and the
--    catalogue reference no longer cascades: deleting a supplement must not
--    erase the history of taking it.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_supplement_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`supplement_id` integer,
	`name` text DEFAULT '' NOT NULL,
	`dose` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`taken` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `day_log`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplement`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- The name and the dose are filled in from the catalogue.
INSERT INTO `__new_supplement_log` ("id", "date", "supplement_id", "name", "dose", "position", "taken")
SELECT sl."id", sl."date", sl."supplement_id",
       COALESCE(s."name", ''), COALESCE(s."dose", ''), COALESCE(s."position", 0), sl."taken"
FROM `supplement_log` sl
LEFT JOIN `supplement` s ON s."id" = sl."supplement_id";
--> statement-breakpoint
DROP TABLE `supplement_log`;
--> statement-breakpoint
ALTER TABLE `__new_supplement_log` RENAME TO `supplement_log`;
--> statement-breakpoint
CREATE UNIQUE INDEX `supplement_log_uq` ON `supplement_log` (`date`,`supplement_id`);
--> statement-breakpoint
CREATE TABLE `__new_plan_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`kind` text NOT NULL,
	`meal_slot_id` integer,
	`dish_id` integer,
	`workout_template_id` integer,
	`supplement_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_slot_id`) REFERENCES `meal_slot`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_template_id`) REFERENCES `workout_template`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_plan_entry` ("id", "plan_id", "weekday", "kind", "meal_slot_id", "dish_id", "workout_template_id", "supplement_id", "position")
SELECT "id", "plan_id", "weekday", "kind", "meal_slot_id", "dish_id", "workout_template_id", NULL, "position" FROM `plan_entry`;
--> statement-breakpoint
DROP TABLE `plan_entry`;
--> statement-breakpoint
ALTER TABLE `__new_plan_entry` RENAME TO `plan_entry`;
--> statement-breakpoint
CREATE INDEX `plan_entry_plan_day_idx` ON `plan_entry` (`plan_id`,`weekday`,`position`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint

-- 2. Existing supplements are spread across the weekdays of every plan.
--    Daily ones go to all seven days; post-workout ones only to the days
--    where the plan holds a strength session.
INSERT INTO `plan_entry` ("plan_id", "weekday", "kind", "meal_slot_id", "dish_id", "workout_template_id", "supplement_id", "position")
SELECT p."id", wd."weekday", 'supplement', NULL, NULL, NULL, s."id", s."position"
FROM `plan` p
CROSS JOIN (SELECT 0 AS weekday UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
            UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) wd
CROSS JOIN `supplement` s
WHERE s."active" = 1
  AND (
    s."schedule" <> 'after_strength'
    OR EXISTS (
      SELECT 1 FROM `plan_entry` pe
      JOIN `workout_template` wt ON wt."id" = pe."workout_template_id"
      WHERE pe."plan_id" = p."id" AND pe."weekday" = wd."weekday"
        AND pe."kind" = 'workout' AND wt."kind" = 'strength'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM `plan_entry` pe2
    WHERE pe2."plan_id" = p."id" AND pe2."weekday" = wd."weekday"
      AND pe2."kind" = 'supplement' AND pe2."supplement_id" = s."id"
  );
--> statement-breakpoint

-- 3. Days already lived read supplements from the journal, so rows are added
--    for the ones never ticked; otherwise the list would come up empty.
INSERT INTO `supplement_log` ("date", "supplement_id", "name", "dose", "position", "taken")
SELECT d."date", s."id", s."name", s."dose", s."position", 0
FROM `day_log` d
CROSS JOIN `supplement` s
WHERE s."active" = 1
  AND NOT EXISTS (
    SELECT 1 FROM `supplement_log` sl
    WHERE sl."date" = d."date" AND sl."supplement_id" = s."id"
  );
--> statement-breakpoint

ALTER TABLE `supplement` DROP COLUMN `schedule`;
