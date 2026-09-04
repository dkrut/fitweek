-- Dish categories are reduced to four: breakfast, main, snack, other.
-- Lunch and dinner are the same main course, and a late snack is no different
-- from a regular one.
UPDATE dish SET category = 'main'  WHERE category IN ('lunch', 'dinner');
--> statement-breakpoint
UPDATE dish SET category = 'snack' WHERE category = 'supper';
--> statement-breakpoint
-- A guard against values no longer present in the enumeration.
UPDATE dish SET category = 'other'
WHERE category NOT IN ('breakfast', 'main', 'snack', 'other');
