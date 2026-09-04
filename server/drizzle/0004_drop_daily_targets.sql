-- Daily targets are no longer set by hand: the target for a day is the planned
-- total of the dishes assigned to that weekday.
ALTER TABLE `settings` DROP COLUMN `kcal_target`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `protein_target`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `fat_target`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `carbs_target`;