-- Distance of a cardio set: a walk is described by one journal row, like any
-- other exercise. The whole-session totals (workout_log.distance_km,
-- duration_min) remain for cases where cardio is not split into sets.
ALTER TABLE `set_log` ADD `distance_km` real;
