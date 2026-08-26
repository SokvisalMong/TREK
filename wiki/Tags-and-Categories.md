# Tags and Categories

TREK has two independent labelling systems for places:

- **Global Place Categories** — admin-managed, shared across every user on the instance (e.g. `Restaurant`, `Museum`).
- **Personal Tags** — user-scoped, private labels (e.g. `hidden gem`, `kid-friendly`).

<!-- TODO: screenshot: tag list on place detail -->

## Global Place Categories

Categories classify places across trips and Collections. Every user sees the same category palette. A place can have one **primary category** and any number of **additional categories**.

**Fields per category:**

- **Name** — displayed in the place form and sidebar filter.
- **Color** — used for the colored icon background on map markers and in the places sidebar. Default: `#6366f1`.
- **Icon** — a Lucide icon name (e.g. `MapPin`, `Coffee`, `Mountain`). The UI form defaults to `MapPin`; the database-level fallback is the 📍 emoji, which is also resolved to the `MapPin` Lucide icon at render time.

### Primary and additional categories

- **Primary category** — stored in `category_id`. It controls the map marker icon and color, the compact list icon, and the category shown where space is limited.
- **Additional categories** — shared classifications displayed as compact badges in place and Collection details. They do not change the marker's visual style.
- A category cannot be both primary and additional on the same place. Choosing an additional category as the new primary removes it from the additional set.
- Clearing the primary category preserves the additional categories. **No primary category** therefore does not necessarily mean uncategorized.
- **Uncategorized** means a place has neither a primary nor any additional categories.

Category filters use OR semantics: a place matches when any selected category is its primary category or one of its additional categories. A place that matches several selected categories is still shown once.

The same category set is preserved when a place is copied between a trip and a Collection. Collection labels and personal tags remain separate.

Categories appear in:

- The **place form** when adding or editing primary and additional categories.
- The **places sidebar** and accommodation picker as filter options.
- **Map markers** — only the primary category icon and color style the marker pin.
- **Map tooltips and place details** — additional category names appear as compact badges.

> **Admin:** Create and manage categories in [Admin-Categories](Admin-Categories). Only admins can create, edit, or delete categories. All users can read them.

## Personal Tags

Tags are private labels owned by each user. They attach to individual places via a many-to-many relationship (`place_tags` table), so the same tag can be applied to as many places as you like, and a single place can carry multiple tags.

**Fields per tag:**

- **Name** — free-form text.
- **Color** — hex value displayed alongside the tag name. Default: `#10b981` (emerald).

Tags are scoped to their creator — other trip members do not see your tags, and different users can create tags with identical names without conflict. Deleting a tag automatically removes it from every place it was attached to.

### Where to manage them

At the moment tags are exposed primarily through the MCP API — AI assistants connected to your instance can list, create, update, and delete tags (`list_tags`, `create_tag`, `update_tag`, `delete_tag`) and attach them to places through the place endpoints. A dedicated web UI for tag management is not yet available; the filter `tag` parameter on the places API / MCP resource does support filtering places by a tag ID once one exists.

> **AI / MCP:** See [MCP-Tools-and-Resources](MCP-Tools-and-Resources) for the full tag tool list.

## When to use which

| Use case | Use |
|---|---|
| Classifying a place by type (Restaurant, Museum, Hiking Trail…) | **Category** |
| Shared classifications where one place fits several types | **Additional categories** |
| Personal labels you want to apply to specific places | **Tag** |

## See also

- [Places-and-Search](Places-and-Search)
- [Admin-Categories](Admin-Categories)
- [MCP-Overview](MCP-Overview)
