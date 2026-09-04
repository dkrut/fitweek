-- The field rule is reduced to the exercise type: strength work is always
-- counted in sets and reps, and time is left to cardio and mobility only.
-- A plank keeps its duration in the note, so it is moved there.

-- 1. Append the duration to the note unless it is already mentioned there.
UPDATE `workout_template_exercise`
SET `notes` = CASE
    WHEN `notes` = '' THEN 'Держать ' || `target_seconds` || ' сек'
    ELSE `notes` || ' · ' || `target_seconds` || ' сек'
  END
WHERE `target_seconds` IS NOT NULL
  AND `notes` NOT LIKE '%сек%'
  AND `notes` NOT LIKE '%мин%'
  AND `exercise_id` IN (SELECT `id` FROM `exercise` WHERE `category` = 'strength');
--> statement-breakpoint

-- 2. Strength exercises no longer carry a time: the field is hidden, and the
--    value would sit as dead weight, still rendering 3x45 sec instead of
--    4x8-12.
UPDATE `workout_template_exercise`
SET `target_seconds` = NULL
WHERE `exercise_id` IN (SELECT `id` FROM `exercise` WHERE `category` = 'strength');
--> statement-breakpoint

ALTER TABLE `exercise` DROP COLUMN `measure`;
