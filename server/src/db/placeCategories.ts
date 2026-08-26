import type { Category } from '../types';

import type Database from 'better-sqlite3';

export interface PlaceCategoryWriteInput {
  category_id?: unknown;
  additional_category_ids?: unknown;
}

export interface NormalizedPlaceCategoryWrite {
  categoryId: number | null;
  categoryIdProvided: boolean;
  additionalCategoryIds: number[] | undefined;
  additionalCategoryIdsProvided: boolean;
}

export class PlaceCategoryValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'PlaceCategoryValidationError';
  }
}

/** Validate and normalize one primary category plus an optional replacement additional set. */
export function normalizePlaceCategoryWrite(
  db: Database.Database,
  input: PlaceCategoryWriteInput,
  currentPrimaryCategoryId: number | null = null,
): NormalizedPlaceCategoryWrite {
  const categoryIdProvided =
    Object.prototype.hasOwnProperty.call(input, 'category_id') && input.category_id !== undefined;
  const additionalCategoryIdsProvided =
    Object.prototype.hasOwnProperty.call(input, 'additional_category_ids') &&
    input.additional_category_ids !== undefined;

  let categoryId = currentPrimaryCategoryId;
  if (categoryIdProvided) {
    if (input.category_id === null) {
      categoryId = null;
    } else if (typeof input.category_id === 'number' && Number.isInteger(input.category_id) && input.category_id > 0) {
      categoryId = input.category_id;
    } else {
      throw new PlaceCategoryValidationError('category_id must be a positive integer or null');
    }
  }

  let additionalCategoryIds: number[] | undefined;
  if (additionalCategoryIdsProvided) {
    if (!Array.isArray(input.additional_category_ids)) {
      throw new PlaceCategoryValidationError('additional_category_ids must be an array of positive integers');
    }

    const uniqueIds = new Set<number>();
    for (const value of input.additional_category_ids) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new PlaceCategoryValidationError('additional_category_ids must be an array of positive integers');
      }
      if (value !== categoryId) uniqueIds.add(value);
    }
    additionalCategoryIds = [...uniqueIds];
  }

  const idsToValidate = additionalCategoryIds ? [...additionalCategoryIds] : [];
  if (categoryIdProvided && categoryId !== null) idsToValidate.push(categoryId);
  if (idsToValidate.length > 0) {
    const categoryRows = db.prepare('SELECT id FROM categories').all() as Array<{ id: number }>;
    const existingIds = new Set(categoryRows.map(({ id }) => id));
    const missingIds = idsToValidate.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new PlaceCategoryValidationError(
        `Unknown category id${missingIds.length === 1 ? '' : 's'}: ${missingIds.join(', ')}`,
      );
    }
  }

  return { categoryId, categoryIdProvided, additionalCategoryIds, additionalCategoryIdsProvided };
}

interface AdditionalCategoryRow extends Category {
  parent_id: number;
}

function initializeCategoryGroups(parentIds: number[]): Record<number, Category[]> {
  const categoriesByParentId: Record<number, Category[]> = {};
  for (const parentId of parentIds) categoriesByParentId[parentId] = [];
  return categoriesByParentId;
}

/** Batch-load every trip-place relation in one query, including empty parent groups. */
export function loadAdditionalCategoriesByPlaceIds(
  db: Database.Database,
  placeIds: number[],
): Record<number, Category[]> {
  const categoriesByPlaceId = initializeCategoryGroups(placeIds);
  if (placeIds.length === 0) return categoriesByPlaceId;

  const placeholders = placeIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT pac.place_id AS parent_id, c.id, c.name, c.color, c.icon
       FROM place_additional_categories pac
       JOIN categories c ON c.id = pac.category_id
       WHERE pac.place_id IN (${placeholders})
       ORDER BY c.name ASC, c.id ASC`,
    )
    .all(...placeIds) as AdditionalCategoryRow[];

  for (const { parent_id: placeId, ...category } of rows) categoriesByPlaceId[placeId].push(category);
  return categoriesByPlaceId;
}

/** Batch-load every collection-place relation in one query, including empty parent groups. */
export function loadAdditionalCategoriesByCollectionPlaceIds(
  db: Database.Database,
  placeIds: number[],
): Record<number, Category[]> {
  const categoriesByPlaceId = initializeCategoryGroups(placeIds);
  if (placeIds.length === 0) return categoriesByPlaceId;

  const placeholders = placeIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT cpac.collection_place_id AS parent_id, c.id, c.name, c.color, c.icon
       FROM collection_place_additional_categories cpac
       JOIN categories c ON c.id = cpac.category_id
       WHERE cpac.collection_place_id IN (${placeholders})
       ORDER BY c.name ASC, c.id ASC`,
    )
    .all(...placeIds) as AdditionalCategoryRow[];

  for (const { parent_id: placeId, ...category } of rows) categoriesByPlaceId[placeId].push(category);
  return categoriesByPlaceId;
}

export function replacePlaceAdditionalCategories(
  db: Database.Database,
  placeId: number | bigint | string,
  categoryIds: readonly number[],
): void {
  db.prepare('DELETE FROM place_additional_categories WHERE place_id = ?').run(placeId);
  const insert = db.prepare('INSERT INTO place_additional_categories (place_id, category_id) VALUES (?, ?)');
  for (const categoryId of categoryIds) insert.run(placeId, categoryId);
}

export function replaceCollectionPlaceAdditionalCategories(
  db: Database.Database,
  placeId: number | bigint | string,
  categoryIds: readonly number[],
): void {
  db.prepare('DELETE FROM collection_place_additional_categories WHERE collection_place_id = ?').run(placeId);
  const insert = db.prepare(
    'INSERT INTO collection_place_additional_categories (collection_place_id, category_id) VALUES (?, ?)',
  );
  for (const categoryId of categoryIds) insert.run(placeId, categoryId);
}
