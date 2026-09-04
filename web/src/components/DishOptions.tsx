import type { Dish } from '@shared/index';
import { dishCategories, dishCategoryLabels } from '@shared/index';
import { num } from '../lib/format';

/**
 * Dish options for <Select>, grouped by meal category with optgroup.
 * A flat list of ten dishes still reads fine, fifty does not, and with groups
 * it is obvious where to look for breakfast.
 * One component for all three places a dish is picked: the weekly plan, a
 * swap inside a day and an unplanned meal.
 */
export function DishOptions({ dishes }: { dishes: Dish[] }) {
  return (
    <>
      {dishCategories.map((category) => {
        const group = dishes.filter((dish) => dish.category === category);
        if (group.length === 0) return null;

        return (
          <optgroup key={category} label={dishCategoryLabels[category]}>
            {group.map((dish) => (
              <option key={dish.id} value={dish.id}>
                {dish.name} · {num(dish.kcal, 0)} ккал
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
