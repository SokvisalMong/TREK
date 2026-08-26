import { db, canAccessTrip } from '../db/database';
import { loadAdditionalCategoriesByPlaceIds } from '../db/placeCategories';
import type { Place } from '../types';
import { serveFilePath } from './placePhotoCache';
import { loadTagsByPlaceIds } from './queryHelpers';
import { getUserSettings } from './settingsService';

import crypto from 'crypto';

const PLACE_PHOTO_PROXY_PREFIX = '/api/maps/place-photo/';

/**
 * Place photo proxy URLs (`/api/maps/place-photo/<id>/bytes`) are served by the
 * JWT-guarded MapsController, so they 401 for an unauthenticated shared-trip
 * viewer. Rewrite them to the public, token-scoped equivalent
 * (`/api/shared/<token>/place-photo/<id>/bytes`) so thumbnails load in a shared
 * link. A simple prefix swap keeps the already-encoded placeId segment intact, so
 * the URL round-trips. Non-proxy URLs (data:, /uploads/, null) pass through.
 */
function rewritePlacePhotoUrl(url: string | null | undefined, token: string): string | null {
  if (typeof url === 'string' && url.startsWith(PLACE_PHOTO_PROXY_PREFIX)) {
    return `/api/shared/${token}/place-photo/${url.slice(PLACE_PHOTO_PROXY_PREFIX.length)}`;
  }
  return url ?? null;
}

interface SharePermissions {
  share_map?: boolean;
  share_bookings?: boolean;
  share_packing?: boolean;
  share_budget?: boolean;
  share_collab?: boolean;
}

interface ShareTokenInfo {
  token: string;
  created_at: string;
  share_map: boolean;
  share_bookings: boolean;
  share_packing: boolean;
  share_budget: boolean;
  share_collab: boolean;
}

interface SharedTokenRow {
  trip_id: number;
  created_by: number | null;
  share_map: number;
  share_bookings: number;
  share_packing: number;
  share_budget: number;
  share_collab: number;
}

interface SharedDayRow extends Record<string, unknown> {
  id: number;
}

interface SharedDayNoteRow extends Record<string, unknown> {
  day_id: number;
}

interface SharedAssignmentRow {
  id: number;
  day_id: number;
  order_index: number;
  notes: string | null;
  place_id: number;
  place_name: string;
  place_description: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  category_id: number | null;
  price: number | null;
  place_time: string | null;
  end_time: string | null;
  image_url: string | null;
  transport_mode: string | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

interface SharedPlaceRow extends Place {
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
}

interface SharedReservationRow extends Record<string, unknown> {
  id: number;
  day_positions?: Record<number, number> | null;
}

/**
 * Creates a new share link or updates the permissions on an existing one.
 * Returns an object with the token string and whether it was newly created.
 */
export function createOrUpdateShareLink(
  tripId: string,
  createdBy: number,
  permissions: SharePermissions,
): { token: string; created: boolean } {
  const {
    share_map = true,
    share_bookings = true,
    share_packing = false,
    share_budget = false,
    share_collab = false,
  } = permissions;

  const existing = db.prepare('SELECT token FROM share_tokens WHERE trip_id = ?').get(tripId) as
    | { token: string }
    | undefined;
  if (existing) {
    db.prepare(
      'UPDATE share_tokens SET share_map = ?, share_bookings = ?, share_packing = ?, share_budget = ?, share_collab = ? WHERE trip_id = ?',
    ).run(
      share_map ? 1 : 0,
      share_bookings ? 1 : 0,
      share_packing ? 1 : 0,
      share_budget ? 1 : 0,
      share_collab ? 1 : 0,
      tripId,
    );
    return { token: existing.token, created: false };
  }

  // New share links default to a 90-day TTL. Existing tokens that were
  // created before the expires_at migration keep NULL here and remain
  // valid indefinitely until the owner rotates them; that preserves
  // behaviour for anyone who's already sharing a link.
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    tripId,
    token,
    createdBy,
    share_map ? 1 : 0,
    share_bookings ? 1 : 0,
    share_packing ? 1 : 0,
    share_budget ? 1 : 0,
    share_collab ? 1 : 0,
    expiresAt,
  );
  return { token, created: true };
}

/**
 * Returns share token info for a trip, or null if no share link exists.
 */
export function getShareLink(tripId: string): ShareTokenInfo | null {
  const row = db.prepare('SELECT * FROM share_tokens WHERE trip_id = ?').get(tripId) as any;
  if (!row) return null;
  return {
    token: row.token,
    created_at: row.created_at,
    share_map: !!row.share_map,
    share_bookings: !!row.share_bookings,
    share_packing: !!row.share_packing,
    share_budget: !!row.share_budget,
    share_collab: !!row.share_collab,
  };
}

/**
 * Deletes the share token for a trip.
 */
export function deleteShareLink(tripId: string): void {
  db.prepare('DELETE FROM share_tokens WHERE trip_id = ?').run(tripId);
}

/**
 * Loads the full public trip data for a share token, filtered by the token's
 * permission flags. Returns null if the token is invalid or the trip is gone.
 */
export function getSharedTripData(token: string): Record<string, unknown> | null {
  const shareRow = db
    .prepare("SELECT * FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))")
    .get(token) as SharedTokenRow | undefined;
  if (!shareRow) return null;

  const tripId = shareRow.trip_id;
  const trip = db
    .prepare('SELECT id, title, description, start_date, end_date, cover_image, currency FROM trips WHERE id = ?')
    .get(tripId) as (Record<string, unknown> & { currency?: string }) | undefined;
  if (!trip) return null;

  const days = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as SharedDayRow[];
  const dayIds = days.map(({ id }) => id);
  let assignments: Record<number, unknown[]> = {};
  let dayNotes: Record<number, unknown[]> = {};

  if (dayIds.length > 0) {
    const placeholders = dayIds.map(() => '?').join(',');
    const allAssignments = db
      .prepare(
        `SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
          p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
          COALESCE(da.assignment_time, p.place_time) as place_time,
          COALESCE(da.assignment_end_time, p.end_time) as end_time,
          p.duration_minutes, p.notes as place_notes, p.image_url, p.transport_mode,
          c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM day_assignments da
        JOIN places p ON da.place_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE da.day_id IN (${placeholders})
        ORDER BY da.order_index ASC, da.created_at ASC`,
      )
      .all(...dayIds) as SharedAssignmentRow[];

    const placeIds = [...new Set(allAssignments.map(({ place_id }) => place_id))];
    const tagsByPlace = loadTagsByPlaceIds(placeIds, { compact: true });
    const additionalCategoriesByPlace = loadAdditionalCategoriesByPlaceIds(db, placeIds);
    const byDay: Record<number, unknown[]> = {};
    for (const assignment of allAssignments) {
      if (!byDay[assignment.day_id]) byDay[assignment.day_id] = [];
      const additionalCategories = additionalCategoriesByPlace[assignment.place_id];
      byDay[assignment.day_id].push({
        id: assignment.id,
        day_id: assignment.day_id,
        order_index: assignment.order_index,
        notes: assignment.notes,
        place: {
          id: assignment.place_id,
          name: assignment.place_name,
          description: assignment.place_description,
          lat: assignment.lat,
          lng: assignment.lng,
          address: assignment.address,
          category_id: assignment.category_id,
          price: assignment.price,
          place_time: assignment.place_time,
          end_time: assignment.end_time,
          image_url: rewritePlacePhotoUrl(assignment.image_url, token),
          transport_mode: assignment.transport_mode,
          category: assignment.category_id
            ? {
                id: assignment.category_id,
                name: assignment.category_name,
                color: assignment.category_color,
                icon: assignment.category_icon,
              }
            : null,
          additional_category_ids: additionalCategories.map(({ id }) => id),
          additional_categories: additionalCategories,
          tags: tagsByPlace[assignment.place_id] || [],
        },
      });
    }
    assignments = byDay;

    const allNotes = db
      .prepare(
        `SELECT * FROM day_notes
         WHERE day_id IN (${placeholders})
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(...dayIds) as SharedDayNoteRow[];
    const notesByDay: Record<number, unknown[]> = {};
    for (const note of allNotes) {
      if (!notesByDay[note.day_id]) notesByDay[note.day_id] = [];
      notesByDay[note.day_id].push(note);
    }
    dayNotes = notesByDay;
  }

  const placeRows = db
    .prepare(
      `SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM places p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.trip_id = ?
       ORDER BY p.created_at DESC`,
    )
    .all(tripId) as SharedPlaceRow[];
  const additionalCategoriesByPlace = loadAdditionalCategoriesByPlaceIds(
    db,
    placeRows.map(({ id }) => id),
  );
  const places = placeRows.map((place) => {
    const additionalCategories = additionalCategoriesByPlace[place.id];
    return {
      ...place,
      image_url: rewritePlacePhotoUrl(place.image_url, token),
      category: place.category_id
        ? {
            id: place.category_id,
            name: place.category_name,
            color: place.category_color,
            icon: place.category_icon,
          }
        : null,
      additional_category_ids: additionalCategories.map(({ id }) => id),
      additional_categories: additionalCategories,
    };
  });

  // Reservations include per-day positions so the public planner keeps the same order.
  const reservations = db
    .prepare('SELECT * FROM reservations WHERE trip_id = ? ORDER BY reservation_time ASC')
    .all(tripId) as SharedReservationRow[];
  const dayPositions = db
    .prepare(
      `SELECT rdp.reservation_id, rdp.day_id, rdp.position
       FROM reservation_day_positions rdp
       JOIN reservations r ON rdp.reservation_id = r.id
       WHERE r.trip_id = ?`,
    )
    .all(tripId) as Array<{ reservation_id: number; day_id: number; position: number }>;
  const positionsByReservation = new Map<number, Record<number, number>>();
  for (const position of dayPositions) {
    if (!positionsByReservation.has(position.reservation_id)) {
      positionsByReservation.set(position.reservation_id, {});
    }
    const reservationPositions = positionsByReservation.get(position.reservation_id);
    if (reservationPositions) reservationPositions[position.day_id] = position.position;
  }
  for (const reservation of reservations) {
    reservation.day_positions = positionsByReservation.get(reservation.id) || null;
  }

  const accommodations = db
    .prepare(
      `SELECT a.*, p.name as place_name, p.address as place_address, p.lat as place_lat, p.lng as place_lng
       FROM day_accommodations a
       JOIN places p ON a.place_id = p.id
       WHERE a.trip_id = ?`,
    )
    .all(tripId);
  const packing = db
    .prepare('SELECT * FROM packing_items WHERE trip_id = ? AND is_private = 0 ORDER BY sort_order ASC')
    .all(tripId);
  const budget = db.prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY category ASC').all(tripId);
  const categories = db.prepare('SELECT * FROM categories').all();
  const permissions = {
    share_map: !!shareRow.share_map,
    share_bookings: !!shareRow.share_bookings,
    share_packing: !!shareRow.share_packing,
    share_budget: !!shareRow.share_budget,
    share_collab: !!shareRow.share_collab,
  };
  const collabMessages = permissions.share_collab
    ? db
        .prepare(
          `SELECT m.*, u.username, u.avatar
           FROM collab_messages m
           JOIN users u ON m.user_id = u.id
           WHERE m.trip_id = ? AND m.deleted = 0
           ORDER BY m.created_at`,
        )
        .all(tripId)
    : [];

  let baseCurrency = trip.currency || 'EUR';
  if (shareRow.created_by != null) {
    const ownerDefault = getUserSettings(shareRow.created_by)['default_currency'];
    if (typeof ownerDefault === 'string' && ownerDefault.trim()) baseCurrency = ownerDefault.trim();
  }

  return {
    trip,
    baseCurrency,
    categories,
    permissions,
    days: permissions.share_map ? days : [],
    assignments: permissions.share_map ? assignments : {},
    dayNotes: permissions.share_map ? dayNotes : {},
    places: permissions.share_map ? places : [],
    reservations: permissions.share_bookings ? reservations : [],
    accommodations: permissions.share_bookings ? accommodations : [],
    packing: permissions.share_packing ? packing : [],
    budget: permissions.share_budget ? budget : [],
    collab: collabMessages,
  };
}

/**
 * Resolves the on-disk path for a cached place photo requested through a public
 * share link. Validates that the token is valid + unexpired and that the place
 * actually belongs to that token's trip (matched via the stored proxy URL, which
 * covers both Google `placeId` and Wikimedia `coords:` pseudo-IDs without
 * depending on google_place_id). Returns null — never throws — so the caller
 * answers a plain 404, mirroring the authenticated bytes endpoint.
 */
export function getSharedPlacePhotoPath(token: string, placeId: string): string | null {
  const shareRow = db
    .prepare(
      "SELECT trip_id, share_map FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))",
    )
    .get(token) as { trip_id: string; share_map: number } | undefined;
  if (!shareRow) return null;
  // Place photos belong to the map/itinerary section — withhold them when the
  // owner disabled the map, matching getSharedTripData which no longer returns
  // the places (and thus their ids) in that case.
  if (!shareRow.share_map) return null;

  const expectedUrl = `${PLACE_PHOTO_PROXY_PREFIX}${encodeURIComponent(placeId)}/bytes`;
  const place = db
    .prepare('SELECT 1 FROM places WHERE trip_id = ? AND image_url = ?')
    .get(shareRow.trip_id, expectedUrl);
  if (!place) return null;

  return serveFilePath(placeId);
}
