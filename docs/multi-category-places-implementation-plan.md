# Multi-Category Places Implementation Plan

## Status

Planning only. This document defines the complete implementation before source changes begin.

## Goal

Allow one location to belong to multiple shared place categories while preserving the existing `places.category_id` field and all existing clients.

Example:

- Primary category: `Hotel`
- Additional categories: `Restaurant`, `Cafe`, `Nature`

The primary category remains the canonical visual category. Additional categories participate in classification and filtering.

## Constraints

This plan follows the repository's contribution rules:

- Discuss the feature in Discord `#github-pr` before coding.
- Keep the change focused and free of unrelated refactors.
- Target `dev`, not `main`.
- Preserve backward compatibility; do not remove or repurpose `category_id`.
- Follow existing TypeScript, SQLite, Zustand, WebSocket, MCP, and i18n patterns.
- Add tests for every new observable behavior.
- Keep migrations additive and append-only.
- Do not auto-map Google/OSM POI types to user categories. The repository explicitly declined automatic category autofill in [Discussion #1341](https://github.com/liketrek/TREK/discussions/1341).

Relevant repository guidance:

- [Contributing guide](../CONTRIBUTING.md)
- [Development environment and upstream workflow](../wiki/Development-environment.md)
- [Tags and Categories](../wiki/Tags-and-Categories.md)

## Product decisions

### Primary category

`places.category_id` remains unchanged, nullable, and represents the primary category.

The primary category continues to control:

- map marker icon and color;
- compact place-list icon;
- legacy API behavior;
- default category shown in existing UI surfaces;
- primary category displayed in PDFs and shared views when space is limited.

No existing field is renamed, removed, or converted to an array.

### Additional categories

Additional categories are an explicit set of category IDs attached to a place.

Rules:

- IDs must be valid categories.
- Duplicate IDs are normalized away.
- The primary category ID is never retained in the additional set.
- A place may have no primary category and still have additional categories. This preserves data when an existing primary category is cleared.
- A place with no primary and no additional categories is the only truly uncategorized place.
- Existing UI labels should continue to use the current wording where possible; if the distinction is exposed, use `No primary category` rather than implying that additional categories do not exist.

### Primary-category changes

Changing `category_id` remains a replacement operation for compatibility with existing clients.

- If the new primary is already additional, remove it from the additional set.
- Do not silently demote the old primary into the additional set.
- The new multi-category UI may explicitly add the old primary as an additional category if the user wants to preserve it.
- A legacy update that omits additional-category data must not clear existing additional categories.

This preserves old client behavior while making the new UI's full category set explicit.

### Filtering

Category filters use OR semantics:

> A place matches when the selected category is its primary category or appears in its additional categories.

A place matching multiple selected categories appears only once.

The uncategorized filter matches places with no primary and no additional categories. If a future UX needs to find places with no primary regardless of additional categories, that should be a separate `No primary category` filter rather than changing the meaning of `Uncategorized`.

### Visual presentation

The primary category remains the only map marker icon/color. Multiple icons on a marker would be noisy and would break existing visual assumptions.

Additional categories should be visible as compact text chips or badges in place details/editing surfaces. Tooltips and detail views may list their names. The primary marker remains unchanged for backwards compatibility.

### Tags remain separate

The existing tag system is not replaced. Tags are user-scoped and semantically different from shared categories. Do not silently reuse personal tags as shared additional categories.

## Data model

### Trip places

Add a normalized join table; do not add a JSON array column to `places`:

```sql
CREATE TABLE place_additional_categories (
  place_id INTEGER NOT NULL
    REFERENCES places(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL
    REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, category_id)
);
```

Add indexes for both access directions:

```sql
CREATE INDEX idx_place_additional_categories_place
  ON place_additional_categories(place_id);

CREATE INDEX idx_place_additional_categories_category
  ON place_additional_categories(category_id);
```

The composite primary key prevents duplicate additional assignments. The primary/additional collision must still be normalized in application code because `places.category_id` is stored in a different table.

### Collection places

`collection_places` is a separate persistent location model and already has its own `category_id`. A complete implementation must not lose additional categories when locations move between Collections and trips.

Add the corresponding relation:

```sql
CREATE TABLE collection_place_additional_categories (
  collection_place_id INTEGER NOT NULL
    REFERENCES collection_places(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL
    REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_place_id, category_id)
);
```

Add the same two indexes for collection places.

Use separate tables instead of a polymorphic relation so SQLite foreign keys remain real and enforceable.

### Migrations

Update both schema paths:

1. Add the tables and indexes to `server/src/db/schema.ts` for fresh databases.
2. Append one additive migration to `server/src/db/migrations.ts` for existing databases.
3. Do not edit or reorder historical migrations.
4. Existing primary categories require no backfill rows; they remain in `places.category_id` and `collection_places.category_id`.
5. Existing places and collections must remain readable if migration runs against a partially older database.
6. Category deletion must continue to set the primary `category_id` to `NULL` according to the existing behavior and cascade only the corresponding additional relation rows.

Migration tests must verify both fresh-schema creation and upgrade from a database containing existing primary categories.

## API and type contracts

### Write payloads

Add the optional field to place and collection-place create/update contracts:

```ts
additional_category_ids?: number[]
```

For updates:

- omitted: preserve existing additional categories;
- `[]`: clear additional categories;
- non-empty array: replace the complete additional set after normalization.

The same field must be supported anywhere a place can be created or updated, including:

- normal place creation;
- normal place editing;
- create-place-and-assign-to-day;
- accommodation place creation;
- bulk place updates;
- MCP create/update tools;
- collection-place creation/editing;
- copy operations between Collections and trips.

### Read payloads

Retain existing fields:

```ts
category_id
category
```

Add:

```ts
additional_category_ids: number[]
additional_categories: Category[]
```

`additional_category_ids` is useful for editing and filtering. `additional_categories` avoids client-side category lookups for display. Use the existing category object shape with `id`, `name`, `color`, and `icon`.

Older clients can ignore the new fields.

### Validation and normalization

Create one shared server-side normalizer used by all write paths:

1. Validate that every ID is an integer and positive.
2. Validate that every category exists and is available under the same permission rules as `category_id`.
3. Deduplicate IDs.
4. Remove the current primary ID from the additional set.
5. Persist primary and additional values in one transaction.

Do not rely on the browser to enforce these rules.

### Filter contracts

Preserve existing single-category filters for compatibility. Add an additive multi-category form for APIs that need it, preferably:

```ts
category_ids?: number[]
```

The legacy single `category`/`category_id` filter maps to a one-element category set. The new filter matches primary or additional assignments using OR semantics.

Update REST query validation, MCP schemas, shared Zod/API contracts, and descriptions consistently.

## Server implementation

### Shared category loader

Extend the existing place-category loading pattern used by `loadTagsByPlaceIds`:

- load additional categories for all returned place IDs in one query;
- group rows by place ID in memory;
- return empty arrays for places without additional categories;
- avoid one query per place.

Update the singular category projection without changing its meaning.

### Place service

Update `server/src/services/placeService.ts`:

- create additional relation rows during place creation;
- replace additional rows only when the update field is present;
- remove a new primary from the additional set;
- preserve additional rows for legacy updates that omit the field;
- include additional categories in `listPlaces`, `getPlace`, `createPlace`, and `updatePlace` results;
- extend category filtering to primary or additional categories;
- keep tag filtering independent;
- use a transaction for place plus relation writes;
- ensure `updated_at` and optimistic-concurrency behavior cover additional-category changes;
- return the normalized state in conflict responses.

Use `EXISTS` predicates for category filtering rather than joins that can duplicate place rows.

### REST controllers

Update the NestJS place controller and any legacy Express/controller paths that still handle place writes:

- create place;
- update place;
- create place assigned to a day;
- bulk update places;
- list/filter places;
- collection-place endpoints.

Maintain the current access-control and trip-ownership checks.

### MCP

Update `server/src/mcp/tools/places.ts` and `server/src/mcp/tools/days.ts`:

- create-place schemas;
- update-place schemas;
- bulk-update schemas;
- create-accommodation/place schemas;
- list-place category filters;
- tool descriptions and examples.

The MCP response must expose the same normalized additional-category data as the web API.

### Other server read paths

Audit and update all category-bearing projections so additional categories are preserved or exposed consistently:

- `server/src/db/database.ts`;
- day and assignment services;
- query helpers;
- share service;
- collection service;
- trip duplication/copy logic;
- place import/export paths;
- demo seed and reset paths;
- plugin entity snapshots and event payloads;
- any PDF/export data preparation.

No path may silently discard additional categories during a copy or transformation.

### Real-time events

Update place-created and place-updated broadcasts so the payload contains normalized additional categories.

Update event/entity snapshots where category fields are enumerated. Older clients should continue to process the event because the existing primary fields remain unchanged and unknown fields are additive.

### Offline behavior

Audit offline repositories, mutation queues, and replay handling:

- include `additional_category_ids` in create/update payloads;
- preserve omitted-versus-empty update semantics;
- ensure replay does not overwrite newer additional-category changes unexpectedly;
- update local place objects after optimistic mutations;
- test reconnect and replay behavior.

## Client implementation

### Place form

Update `PlaceFormModal`:

- retain the existing single primary-category picker;
- add an additional-category multi-select;
- exclude the current primary from additional options;
- remove a category from additional selection if it becomes primary;
- show selected additional categories as removable chips;
- preserve additional categories when editing;
- submit the full `additional_category_ids` set;
- retain the current `No category` primary option.

Add a focused reusable selector only if existing controls cannot support this without duplication. Do not introduce a broad new form abstraction for one field.

### Collections

Update collection add/edit/detail surfaces to support the same primary/additional distinction:

- `AddPlaceToCollectionModal`;
- `CollectionPlaceDetail`;
- collection save/update stores;
- collection category options and filters;
- copy-to-trip and save-to-collection flows.

Collection labels remain separate from shared categories.

### Place display

Update place details, inspector, sidebar rows, and planner cards to show additional category names without replacing the primary visual treatment.

Keep primary icon/color behavior unchanged.

### Category filters

Update every filter implementation, not only the main places sidebar:

- places sidebar and header;
- trip planner filtering;
- map/planner marker filtering;
- hotel/accommodation place picker;
- collection category filtering;
- any shared-trip or public-view filters;
- MCP/API-backed filter controls.

Use one shared predicate where possible:

```ts
matchesCategory(place, categoryId) {
  return place.category_id === categoryId
    || place.additional_category_ids.includes(categoryId)
}
```

For a selected set, use OR semantics and deduplicate output places.

Update category counts so a place contributes at most once to each category it belongs to, while contributing to both its primary and additional categories when appropriate.

### Stores and models

Update client place types, Zustand stores, collection models, selectors, and hydration/serialization code.

Ensure remote updates and optimistic updates patch both:

- `category_id`;
- `additional_category_ids` / resolved additional category data.

### Map and PDF behavior

Map markers retain primary category icon/color. Tooltips or detail popovers may list additional category names.

PDF/export output should include additional category names where the layout supports them, while preserving primary-category output for compatibility and visual stability.

## Cross-surface preservation matrix

Every row below must either support additional categories or deliberately preserve them during the operation:

| Surface | Required behavior |
|---|---|
| Create/edit place | Read and write additional categories |
| Places sidebar | Filter by primary or additional category |
| Trip planner | Same filter semantics and display |
| Map markers | Primary styling; additional names available in detail/tooltip |
| Hotel picker | Category matching includes additional categories |
| Bulk update | Set/replace additional categories; never create primary duplicates |
| MCP | Create/update/list/filter support |
| REST API | Additive request/response fields |
| WebSocket | Broadcast normalized additional data |
| Offline replay | Preserve arrays and update semantics |
| Trip duplication | Copy additional relations |
| Collection creation/editing | Store and filter additional relations |
| Collection-to-trip copy | Preserve additional relations |
| Trip-to-collection copy | Preserve additional relations |
| Shared trip view | Expose additional names without breaking old payloads |
| Public sharing | Preserve/display additional data according to current permissions |
| PDF/export | Preserve or display additional categories where supported |
| Imports | Accept additional category data when the format provides it; never discard existing data during import/update |
| Demo/reset | Seed and clear relation rows correctly |
| Category deletion | Remove additional relation rows; retain existing primary-null behavior |

## Testing plan

### Database and migration tests

- Fresh schema creates both relation tables and indexes.
- Existing database upgrades without losing primary categories.
- Composite keys reject duplicate relations.
- Category deletion removes additional relation rows.
- Place deletion removes additional relation rows.
- Collection-place deletion removes collection relations.

### Server unit/integration tests

Cover:

- create with primary and additional categories;
- create with duplicate IDs;
- create with primary repeated in additional IDs;
- update with omitted additional field;
- update with an empty additional array;
- update with a replacement array;
- changing primary to an existing additional category;
- clearing the primary while additional categories remain;
- invalid/nonexistent category IDs;
- authorization and trip isolation;
- list filtering by primary category;
- list filtering by additional category;
- multiple-category OR filtering;
- no duplicate list results;
- uncategorized filtering;
- bulk updates;
- optimistic-concurrency conflicts;
- WebSocket payloads;
- MCP create/update/list/filter behavior;
- collection copy and trip copy.

### Client tests

Cover:

- primary category remains selected correctly;
- additional selector excludes the primary;
- selecting a new primary removes it from additional selections;
- editing loads existing additional categories;
- clearing all additional categories works;
- sidebar filtering matches primary and additional categories;
- multiple selected filters use OR semantics;
- a place matching two filters renders once;
- uncategorized behavior;
- hotel picker matching through additional categories;
- collection filters and label filters remain independent;
- optimistic and remote updates preserve additional categories.

### End-to-end smoke scenarios

Exercise the real application:

1. Create a place with `Hotel` primary and `Restaurant`, `Cafe`, and `Nature` additional.
2. Reload and verify all assignments persist.
3. Filter by each category and verify the place appears.
4. Select multiple filters and verify the place appears once.
5. Change the primary category and verify duplicate prevention.
6. Clear additional categories and verify primary behavior remains unchanged.
7. Copy the place to a collection and back to a trip.
8. Open the trip through a shared/public view.
9. Update the place through MCP or REST and verify the UI receives the change.
10. Upgrade a database containing existing places and verify legacy categories remain intact.

## Documentation and translations

Update:

- `wiki/Tags-and-Categories.md` to distinguish primary and additional shared categories from personal tags;
- API/MCP documentation and examples;
- category filter behavior documentation;
- migration/release notes if the project maintains them;
- all new UI strings across every locale;
- i18n parity tests.

Do not claim that POI-provider categories are automatically imported unless that behavior is separately approved and implemented.

## Upstream and branch maintenance

Before coding:

```bash
git remote add upstream git@github.com:liketrek/TREK.git
git fetch upstream
git switch -c feat/multi-category-places upstream/dev
```

During development:

```bash
git fetch upstream
git rebase upstream/dev
```

Keep the branch focused. The highest-conflict files are likely:

- `server/src/db/schema.ts`;
- `server/src/db/migrations.ts`;
- place services/controllers;
- shared place contracts;
- place/sidebar/collection components;
- translation files.

Rebase frequently rather than allowing upstream changes to accumulate. Do not rewrite historical migrations to resolve a conflict; preserve the migration order and append the feature migration after the current upstream tail.

## Acceptance criteria

The implementation is complete only when all of the following are true:

- `category_id` remains present and behaves as the primary category.
- A place can store one primary plus any number of distinct additional categories.
- The primary category cannot also appear as an additional category.
- Additional categories persist across reloads, updates, migrations, copies, sharing, and supported exports.
- Legacy clients can still create, edit, filter, and display places using only `category_id`.
- New clients can create, edit, display, and filter additional categories.
- All category filters match primary and additional assignments consistently.
- Multiple selected filters use OR semantics and never duplicate a place row.
- Bulk updates, MCP, REST, WebSocket, and offline paths obey the same invariants.
- Collections do not silently lose additional categories.
- Primary marker icon/color behavior is unchanged.
- Existing tags remain separate and functional.
- Migration, server, client, integration, and end-to-end coverage is present.
- i18n parity, type checking, linting, and the relevant test suites pass.
- The feature has been discussed and approved through the repository's required contributor process before an upstream PR is opened.

## Implementation phases

### Phase 1: Maintainer approval and contract lock

- Present this plan in `#github-pr`.
- Confirm the primary-change, nullable-primary, Collections, API naming, and filter semantics.
- Record any maintainer-requested scope changes before coding.

### Phase 2: Schema, migrations, and shared contracts

- Add trip and collection relation tables.
- Add migration coverage.
- Add normalized API/type contracts.
- Add shared category matching helpers where appropriate.

### Phase 3: Server persistence and reads

- Implement relation normalization and transactional writes.
- Load additional categories in bulk.
- Update REST, MCP, bulk, copy, share, and event paths.
- Add server tests before client work depends on the new contract.

### Phase 4: Client editing and filtering

- Add primary/additional editing UI.
- Update all filters and stores.
- Update map/detail/list displays.
- Update Collections and hotel picker behavior.
- Add client tests.

### Phase 5: Preservation surfaces

- Update duplication, imports, exports, PDF, sharing, offline replay, and WebSocket hydration.
- Add cross-surface integration and end-to-end tests.

### Phase 6: Documentation and release readiness

- Update wiki/API/MCP documentation and translations.
- Run the relevant verification commands.
- Rebase on the latest `upstream/dev`.
- Open one focused PR targeting `dev` only after the required maintainer approval.
