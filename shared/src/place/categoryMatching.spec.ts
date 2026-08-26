import { isUncategorizedPlace, matchesAnyPlaceCategory, matchesPlaceCategory } from './categoryMatching';

import { describe, expect, it } from 'vitest';

describe('place category matching', () => {
  const place = { category_id: 1, additional_category_ids: [2, 3] };

  it('matches the primary or any additional category', () => {
    expect(matchesPlaceCategory(place, 1)).toBe(true);
    expect(matchesPlaceCategory(place, 2)).toBe(true);
    expect(matchesPlaceCategory(place, 4)).toBe(false);
  });

  it('uses OR semantics for multiple selected categories', () => {
    expect(matchesAnyPlaceCategory(place, [4, 3])).toBe(true);
    expect(matchesAnyPlaceCategory(place, [4, 5])).toBe(false);
    expect(matchesAnyPlaceCategory(place, [])).toBe(true);
  });

  it('only considers a place uncategorized when both category sets are empty', () => {
    expect(isUncategorizedPlace({ category_id: null, additional_category_ids: [] })).toBe(true);
    expect(isUncategorizedPlace({ category_id: null, additional_category_ids: [2] })).toBe(false);
    expect(isUncategorizedPlace({ category_id: 1, additional_category_ids: [] })).toBe(false);
    expect(isUncategorizedPlace({})).toBe(true);
  });
});
