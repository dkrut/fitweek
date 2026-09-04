CREATE TABLE `app_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_username_unique` ON `app_user` (`username`);--> statement-breakpoint
CREATE TABLE `day_log` (
	`date` text PRIMARY KEY NOT NULL,
	`plan_id` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `dish` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`kcal` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`portion` text DEFAULT '' NOT NULL,
	`recipe` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `dish_archived_idx` ON `dish` (`archived_at`);--> statement-breakpoint
CREATE TABLE `exercise` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'strength' NOT NULL,
	`muscle_group` text DEFAULT 'none' NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `exercise_archived_idx` ON `exercise` (`archived_at`);--> statement-breakpoint
CREATE TABLE `meal_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`meal_slot_id` integer,
	`meal_slot_name` text DEFAULT '' NOT NULL,
	`time_hint` text DEFAULT '' NOT NULL,
	`dish_id` integer,
	`name` text NOT NULL,
	`emoji` text DEFAULT '' NOT NULL,
	`kcal` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`portion` text DEFAULT '' NOT NULL,
	`recipe` text DEFAULT '' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `day_log`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_slot_id`) REFERENCES `meal_slot`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meal_log_date_idx` ON `meal_log` (`date`,`position`);--> statement-breakpoint
CREATE TABLE `meal_slot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`time_hint` text DEFAULT '12:00' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_slot_position_idx` ON `meal_slot` (`position`);--> statement-breakpoint
CREATE TABLE `measurement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`waist_cm` real,
	`chest_cm` real,
	`hip_cm` real,
	`bicep_cm` real,
	`fat_pct` real,
	`visceral` real,
	`muscle_kg` real,
	`bmr_kcal` real,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measurement_date_uq` ON `measurement` (`date`);--> statement-breakpoint
CREATE TABLE `plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `plan_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`kind` text NOT NULL,
	`meal_slot_id` integer,
	`dish_id` integer,
	`workout_template_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_slot_id`) REFERENCES `meal_slot`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_template_id`) REFERENCES `workout_template`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_entry_plan_day_idx` ON `plan_entry` (`plan_id`,`weekday`,`position`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_expires_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `set_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_log_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`set_index` integer DEFAULT 0 NOT NULL,
	`reps` integer,
	`weight_kg` real,
	`seconds` integer,
	`band` text DEFAULT '' NOT NULL,
	`rpe` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	`completed` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`workout_log_id`) REFERENCES `workout_log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `set_log_workout_idx` ON `set_log` (`workout_log_id`,`exercise_id`,`set_index`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`kcal_target` integer DEFAULT 2000 NOT NULL,
	`protein_target` integer DEFAULT 150 NOT NULL,
	`fat_target` integer DEFAULT 65 NOT NULL,
	`carbs_target` integer DEFAULT 200 NOT NULL,
	`water_target_ml` integer DEFAULT 2500 NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dose` text DEFAULT '' NOT NULL,
	`schedule` text DEFAULT 'daily' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplement_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`supplement_id` integer NOT NULL,
	`taken` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `day_log`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplement_log_uq` ON `supplement_log` (`date`,`supplement_id`);--> statement-breakpoint
CREATE TABLE `workout_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`template_id` integer,
	`name` text NOT NULL,
	`emoji` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'strength' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`warmup` text DEFAULT '' NOT NULL,
	`cooldown` text DEFAULT '' NOT NULL,
	`planned_json` text DEFAULT '[]' NOT NULL,
	`duration_min` real,
	`distance_km` real,
	`rpe` real,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `day_log`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_template`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_log_date_uq` ON `workout_log` (`date`);--> statement-breakpoint
CREATE TABLE `workout_template` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'strength' NOT NULL,
	`emoji` text DEFAULT '' NOT NULL,
	`warmup` text DEFAULT '' NOT NULL,
	`cooldown` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `workout_template_archived_idx` ON `workout_template` (`archived_at`);--> statement-breakpoint
CREATE TABLE `workout_template_exercise` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`target_sets` integer DEFAULT 3 NOT NULL,
	`target_reps_min` integer,
	`target_reps_max` integer,
	`target_seconds` integer,
	`rest_sec` integer DEFAULT 90 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `workout_template`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `wte_template_idx` ON `workout_template_exercise` (`template_id`,`position`);