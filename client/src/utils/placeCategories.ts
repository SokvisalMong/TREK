import { isUncategorizedPlace, matchesPlaceCategory, type CategoryAssignablePlace } from '@trek/shared';

/** Apply the planner's string-backed category selection with OR semantics. */
export function matchesPlaceCategoryFilters(
  place: CategoryAssignablePlace,
  categoryFilters: ReadonlySet<string>
): boolean {
  if (categoryFilters.size === 0) return true;
  if (categoryFilters.has('uncategorized') && isUncategorizedPlace(place)) return true;

  for (const filter of categoryFilters) {
    const categoryId = Number(filter);
    if (Number.isInteger(categoryId) && categoryId > 0 && matchesPlaceCategory(place, categoryId)) return true;
  }
  return false;
}
