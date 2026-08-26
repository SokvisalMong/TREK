import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function seedPlaceParents(db: Database.Database) {
  const userId = Number(
    db
      .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
      .run('multi-category-user', 'multi-category@example.test', 'hash').lastInsertRowid,
  );
  const tripId = Number(
    db.prepare('INSERT INTO trips (user_id, title) VALUES (?, ?)').run(userId, 'Trip').lastInsertRowid,
  );
  const primaryCategoryId = Number(
    db.prepare('INSERT INTO categories (name) VALUES (?)').run('Primary').lastInsertRowid,
  );
  const additionalCategoryId = Number(
    db.prepare('INSERT INTO categories (name) VALUES (?)').run('Additional').lastInsertRowid,
  );
  const placeId = Number(
    db
      .prepare('INSERT INTO places (trip_id, name, category_id) VALUES (?, ?, ?)')
      .run(tripId, 'Place', primaryCategoryId).lastInsertRowid,
  );

  return { userId, tripId, primaryCategoryId, additionalCategoryId, placeId };
}

describe('multi-category relation schema and migration', () => {
  it('creates both relation tables and access-direction indexes in the fresh schema', () => {
    const db = createDb();
    try {
      createTables(db);
      const objects = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE name IN (
             'place_additional_categories',
             'idx_place_additional_categories_place',
             'idx_place_additional_categories_category',
             'collection_place_additional_categories',
             'idx_collection_place_additional_categories_place',
             'idx_collection_place_additional_categories_category'
           )`,
        )
        .all() as Array<{ name: string }>;

      expect(objects.map(({ name }) => name).sort()).toEqual(
        [
          'place_additional_categories',
          'idx_place_additional_categories_place',
          'idx_place_additional_categories_category',
          'collection_place_additional_categories',
          'idx_collection_place_additional_categories_place',
          'idx_collection_place_additional_categories_category',
        ].sort(),
      );
    } finally {
      db.close();
    }
  });

  it('enforces uniqueness and cascades relation rows without changing primary deletion semantics', () => {
    const db = createDb();
    try {
      createTables(db);
      const { userId, primaryCategoryId, additionalCategoryId, placeId } = seedPlaceParents(db);

      db.prepare('INSERT INTO place_additional_categories (place_id, category_id) VALUES (?, ?)').run(
        placeId,
        additionalCategoryId,
      );
      expect(() =>
        db
          .prepare('INSERT INTO place_additional_categories (place_id, category_id) VALUES (?, ?)')
          .run(placeId, additionalCategoryId),
      ).toThrow(/UNIQUE constraint failed/);

      db.prepare('DELETE FROM categories WHERE id = ?').run(additionalCategoryId);
      expect(db.prepare('SELECT COUNT(*) AS count FROM place_additional_categories').get()).toEqual({ count: 0 });
      expect(db.prepare('SELECT category_id FROM places WHERE id = ?').get(placeId)).toEqual({
        category_id: primaryCategoryId,
      });

      db.prepare('DELETE FROM categories WHERE id = ?').run(primaryCategoryId);
      expect(db.prepare('SELECT category_id FROM places WHERE id = ?').get(placeId)).toEqual({ category_id: null });

      const collectionId = Number(
        db.prepare('INSERT INTO collections (owner_id, name) VALUES (?, ?)').run(userId, 'List').lastInsertRowid,
      );
      const collectionPlaceId = Number(
        db
          .prepare('INSERT INTO collection_places (collection_id, owner_id, name) VALUES (?, ?, ?)')
          .run(collectionId, userId, 'Saved place').lastInsertRowid,
      );
      const collectionCategoryId = Number(
        db.prepare('INSERT INTO categories (name) VALUES (?)').run('Saved').lastInsertRowid,
      );
      db.prepare(
        'INSERT INTO collection_place_additional_categories (collection_place_id, category_id) VALUES (?, ?)',
      ).run(collectionPlaceId, collectionCategoryId);
      db.prepare('DELETE FROM collection_places WHERE id = ?').run(collectionPlaceId);
      expect(db.prepare('SELECT COUNT(*) AS count FROM collection_place_additional_categories').get()).toEqual({
        count: 0,
      });

      const placeCategoryId = Number(
        db.prepare('INSERT INTO categories (name) VALUES (?)').run('Place extra').lastInsertRowid,
      );
      db.prepare('INSERT INTO place_additional_categories (place_id, category_id) VALUES (?, ?)').run(
        placeId,
        placeCategoryId,
      );
      db.prepare('DELETE FROM places WHERE id = ?').run(placeId);
      expect(db.prepare('SELECT COUNT(*) AS count FROM place_additional_categories').get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it('upgrades an existing database without changing stored primary categories', () => {
    const db = createDb();
    try {
      createTables(db);
      runMigrations(db);
      const { primaryCategoryId, placeId } = seedPlaceParents(db);
      const versionRow = db.prepare('SELECT version FROM schema_version').get() as { version: number };
      const currentVersion = versionRow.version;

      db.exec(`
        DROP TABLE place_additional_categories;
        DROP TABLE collection_place_additional_categories;
      `);
      db.prepare('UPDATE schema_version SET version = ?').run(currentVersion - 1);

      runMigrations(db);

      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'place_additional_categories'")
          .get(),
      ).toEqual({ name: 'place_additional_categories' });
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collection_place_additional_categories'",
          )
          .get(),
      ).toEqual({ name: 'collection_place_additional_categories' });
      expect(db.prepare('SELECT category_id FROM places WHERE id = ?').get(placeId)).toEqual({
        category_id: primaryCategoryId,
      });
    } finally {
      db.close();
    }
  });
});
