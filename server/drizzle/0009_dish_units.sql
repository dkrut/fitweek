ALTER TABLE `dish` ADD `unit` text DEFAULT 'pcs' NOT NULL;--> statement-breakpoint
ALTER TABLE `dish` ADD `default_amount` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `amount` real;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `unit` text DEFAULT 'pcs' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `planned_kcal` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `planned_protein_g` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `planned_fat_g` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log` ADD `planned_carbs_g` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plan_entry` ADD `amount` real;--> statement-breakpoint
-- Every existing dish is counted in pieces at one helping, which is exactly what
-- the journal recorded before amounts existed.
UPDATE `meal_log` SET `amount` = 1 WHERE `dish_id` IS NOT NULL;--> statement-breakpoint
-- The norm used to be read off the fact. Freezing it at today's values keeps
-- every past day scoring the same as it did before this migration; leaving the
-- default of 0 would silently wipe the targets of the whole history.
UPDATE `meal_log` SET `planned_kcal` = `kcal`, `planned_protein_g` = `protein_g`, `planned_fat_g` = `fat_g`, `planned_carbs_g` = `carbs_g` WHERE `planned` = 1;
