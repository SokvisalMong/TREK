export interface CategoryAssignablePlace {
  category_id?: number | null;
  additional_category_ids?: readonly number[];
}

/** Match a shared category without changing the primary category's visual role. */
export function matchesPlaceCategory(place: CategoryAssignablePlace, categoryId: number): boolean {
  return place.category_id === categoryId || place.additional_category_ids?.includes(categoryId) === true;
}

/** Empty selection means no category filter; otherwise selected categories use OR semantics. */
export function matchesAnyPlaceCategory(place: CategoryAssignablePlace, categoryIds: readonly number[]): boolean {
  return categoryIds.length === 0 || categoryIds.some((categoryId) => matchesPlaceCategory(place, categoryId));
}

/** Uncategorized means no primary and no additional shared categories. */
export function isUncategorizedPlace(place: CategoryAssignablePlace): boolean {
  return place.category_id == null && (place.additional_category_ids?.length ?? 0) === 0;
}
