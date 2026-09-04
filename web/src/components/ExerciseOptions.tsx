import type { Exercise } from '@shared/index';
import { exerciseCategoryLabels, muscleGroupLabels, muscleGroups } from '@shared/index';

/**
 * Exercise options for <Select>, grouped with optgroup.
 *
 * Grouping is by muscle group rather than by type: while building a session
 * you think "back next", and by type nearly everything would land in one huge
 * strength group. The type is appended to the name for cardio and mobility so
 * that walking under a "Legs" heading does not surprise anyone.
 */
export function ExerciseOptions({ exercises }: { exercises: Exercise[] }) {
  return (
    <>
      {muscleGroups.map((group) => {
        const list = exercises.filter((exercise) => exercise.muscleGroup === group);
        if (list.length === 0) return null;

        return (
          <optgroup key={group} label={muscleGroupLabels[group]}>
            {list.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
                {exercise.category === 'strength'
                  ? ''
                  : ` · ${exerciseCategoryLabels[exercise.category].toLowerCase()}`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
