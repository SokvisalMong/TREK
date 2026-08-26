import { describe, expect, it } from 'vitest';

import { matchesPlaceCategoryFilters } from './placeCategories';

describe('matchesPlaceCategoryFilters', () => {
  const place = { category_id: 1, additional_category_ids: [2, 3] };

  it('matches primary and additional categories with OR semantics', () => {
    expect(matchesPlaceCategoryFilters(place, new Set(['1']))).toBe(true);
    expect(matchesPlaceCategoryFilters(place, new Set(['2']))).toBe(true);
    expect(matchesPlaceCategoryFilters(place, new Set(['4', '3']))).toBe(true);
    expect(matchesPlaceCategoryFilters(place, new Set(['4', '5']))).toBe(false);
  });

  it('treats only places with no primary or additional categories as uncategorized', () => {
    expect(
      matchesPlaceCategoryFilters({ category_id: null, additional_category_ids: [] }, new Set(['uncategorized']))
    ).toBe(true);
    expect(
      matchesPlaceCategoryFilters({ category_id: null, additional_category_ids: [2] }, new Set(['uncategorized']))
    ).toBe(false);
  });

  it('does not filter when no categories are selected', () => {
    expect(matchesPlaceCategoryFilters(place, new Set())).toBe(true);
  });
});
