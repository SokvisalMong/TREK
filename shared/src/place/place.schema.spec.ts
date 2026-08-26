import {
  placeBulkDeleteRequestSchema,
  placeBulkUpdateRequestSchema,
  placeCreateRequestSchema,
  placeImportListRequestSchema,
  placeUpdateRequestSchema,
} from './place.schema';

import { describe, it, expect } from 'vitest';

describe('placeCreateRequestSchema', () => {
  it('requires a name and keeps the other place fields open', () => {
    expect(
      placeCreateRequestSchema.safeParse({
        name: 'Spot',
        lat: 1,
        lng: 2,
        anything: true,
      }).success,
    ).toBe(true);
    expect(placeCreateRequestSchema.safeParse({ lat: 1 }).success).toBe(false);
  });
});

describe('multi-category place write schemas', () => {
  it('accepts distinct positive integer category ids and preserves omitted versus empty updates', () => {
    expect(
      placeCreateRequestSchema.safeParse({
        name: 'Spot',
        category_id: 1,
        additional_category_ids: [2, 3],
      }).success,
    ).toBe(true);

    const omitted = placeUpdateRequestSchema.parse({});
    const cleared = placeUpdateRequestSchema.parse({ additional_category_ids: [] });
    expect('additional_category_ids' in omitted).toBe(false);
    expect(cleared.additional_category_ids).toEqual([]);
  });

  it('rejects non-positive, fractional, and non-numeric additional category ids', () => {
    for (const additionalCategoryIds of [[0], [-1], [1.5], ['2']]) {
      expect(
        placeCreateRequestSchema.safeParse({
          name: 'Spot',
          additional_category_ids: additionalCategoryIds,
        }).success,
      ).toBe(false);
    }
  });

  it('allows bulk replacement of the primary, additional set, or both', () => {
    expect(placeBulkUpdateRequestSchema.safeParse({ ids: [1], category_id: null }).success).toBe(true);
    expect(placeBulkUpdateRequestSchema.safeParse({ ids: [1], additional_category_ids: [] }).success).toBe(true);
    expect(placeBulkUpdateRequestSchema.safeParse({ ids: [1] }).success).toBe(false);
  });
});

describe('placeBulkDeleteRequestSchema', () => {
  it('requires a numeric ids array', () => {
    expect(placeBulkDeleteRequestSchema.safeParse({ ids: [1, 2] }).success).toBe(true);
    expect(placeBulkDeleteRequestSchema.safeParse({ ids: ['a'] }).success).toBe(false);
  });
});

describe('placeImportListRequestSchema', () => {
  it('requires a non-empty url', () => {
    expect(placeImportListRequestSchema.safeParse({ url: 'http://x' }).success).toBe(true);
    expect(placeImportListRequestSchema.safeParse({ url: '' }).success).toBe(false);
  });
});
