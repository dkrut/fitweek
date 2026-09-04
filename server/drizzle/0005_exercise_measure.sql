-- How an exercise is measured: in reps or in time. The category cannot answer
-- that — a plank is strength work yet is counted in seconds.
ALTER TABLE `exercise` ADD `measure` text DEFAULT 'reps' NOT NULL;
--> statement-breakpoint

-- Cardio and mobility are always measured in time.
UPDATE `exercise` SET `measure` = 'time' WHERE `category` IN ('cardio', 'mobility');
--> statement-breakpoint

-- Strength entries that already carry a time in templates (planks) too.
UPDATE `exercise` SET `measure` = 'time'
WHERE `id` IN (
  SELECT DISTINCT `exercise_id` FROM `workout_template_exercise`
  WHERE `target_seconds` IS NOT NULL
);
