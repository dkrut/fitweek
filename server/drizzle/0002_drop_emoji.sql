-- Emoji are gone from the UI: typing them by hand is awkward, and keeping a
-- decorative column that is never displayed serves no purpose.
ALTER TABLE `dish` DROP COLUMN `emoji`;--> statement-breakpoint
ALTER TABLE `meal_log` DROP COLUMN `emoji`;--> statement-breakpoint
ALTER TABLE `workout_log` DROP COLUMN `emoji`;--> statement-breakpoint
ALTER TABLE `workout_template` DROP COLUMN `emoji`;