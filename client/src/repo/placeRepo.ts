import { placesApi } from '../api/client';
import { offlineDb, upsertPlaces } from '../db/offlineDb';
import { generateUUID, mutationQueue, nextTempId } from '../sync/mutationQueue';
import { isEffectivelyOffline } from '../sync/networkMode';
import type { Category, Place } from '../types';
import { onlineThenCache } from './withOfflineFallback';

async function normalizeOptimisticCategories(place: Place, data: Record<string, unknown>): Promise<Place> {
  const categoryIdProvided =
    Object.prototype.hasOwnProperty.call(data, 'category_id') && data.category_id !== undefined;
  const primaryCategoryId =
    categoryIdProvided && (data.category_id === null || typeof data.category_id === 'number')
      ? data.category_id
      : (place.category_id ?? null);

  const requestedAdditionalIds: unknown[] = Array.isArray(data.additional_category_ids)
    ? data.additional_category_ids
    : (place.additional_category_ids ?? []);
  const additionalCategoryIds = [
    ...new Set<number>(
      requestedAdditionalIds.filter(
        (categoryId): categoryId is number =>
          typeof categoryId === 'number' &&
          Number.isInteger(categoryId) &&
          categoryId > 0 &&
          categoryId !== primaryCategoryId
      )
    ),
  ];
  const additionalCategories = (await offlineDb.categories.bulkGet(additionalCategoryIds)).filter(
    (category): category is Category => category !== undefined
  );
  const primaryCategory =
    typeof primaryCategoryId === 'number' ? ((await offlineDb.categories.get(primaryCategoryId)) ?? null) : null;

  return {
    ...place,
    category_id: typeof primaryCategoryId === 'number' ? primaryCategoryId : null,
    category: primaryCategory,
    additional_category_ids: additionalCategoryIds,
    additional_categories: additionalCategories,
  };
}

export const placeRepo = {
  async list(tripId: number | string, params?: Record<string, unknown>): Promise<{ places: Place[] }> {
    return onlineThenCache(
      async () => {
        const result = await placesApi.list(tripId, params);
        upsertPlaces(result.places);
        return result;
      },
      async () => ({
        places: await offlineDb.places.where('trip_id').equals(Number(tripId)).toArray(),
      })
    );
  },

  async create(tripId: number | string, data: Record<string, unknown> & { name: string }): Promise<{ place: Place }> {
    if (isEffectivelyOffline()) {
      const tempId = nextTempId();
      const tempPlace = await normalizeOptimisticCategories(
        {
          ...(data as Partial<Place>),
          id: tempId,
          trip_id: Number(tripId),
          name: data.name,
          additional_category_ids: [],
          additional_categories: [],
        } as Place,
        data
      );
      await offlineDb.places.put(tempPlace);
      const id = generateUUID();
      await mutationQueue.enqueue({
        id,
        tripId: Number(tripId),
        method: 'POST',
        url: `/trips/${tripId}/places`,
        body: data,
        resource: 'places',
        tempId,
      });
      return { place: tempPlace };
    }
    const result = await placesApi.create(tripId, data);
    offlineDb.places.put(result.place);
    return result;
  },

  async update(tripId: number | string, id: number | string, data: Record<string, unknown>): Promise<{ place: Place }> {
    if (isEffectivelyOffline()) {
      const existing = await offlineDb.places.get(Number(id));
      const optimistic = await normalizeOptimisticCategories(
        { ...(existing ?? ({} as Place)), ...(data as Partial<Place>), id: Number(id) },
        data
      );
      await offlineDb.places.put(optimistic);
      const mutId = generateUUID();
      const isTemp = Number(id) < 0;
      await mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'PUT',
        url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
        body: data,
        resource: 'places',
        entityId: Number(id),
        baseUpdatedAt: existing?.updated_at ?? null,
        ...(isTemp ? { tempEntityId: Number(id) } : {}),
      });
      return { place: optimistic };
    }
    const result = await placesApi.update(tripId, id, data);
    offlineDb.places.put(result.place);
    return result;
  },

  async delete(tripId: number | string, id: number | string): Promise<unknown> {
    if (isEffectivelyOffline()) {
      await offlineDb.places.delete(Number(id));
      const mutId = generateUUID();
      const isTemp = Number(id) < 0;
      await mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'DELETE',
        url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
        body: undefined,
        resource: 'places',
        entityId: Number(id),
        ...(isTemp ? { tempEntityId: Number(id) } : {}),
      });
      return { success: true };
    }
    const result = await placesApi.delete(tripId, id);
    offlineDb.places.delete(Number(id));
    return result;
  },

  async deleteMany(tripId: number | string, ids: number[]): Promise<unknown> {
    if (isEffectivelyOffline()) {
      await offlineDb.places.bulkDelete(ids);
      for (const id of ids) {
        const mutId = generateUUID();
        const isTemp = id < 0;
        await mutationQueue.enqueue({
          id: mutId,
          tripId: Number(tripId),
          method: 'DELETE',
          url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
          body: undefined,
          resource: 'places',
          entityId: id,
          ...(isTemp ? { tempEntityId: id } : {}),
        });
      }
      return { deleted: ids, count: ids.length };
    }
    const result = await placesApi.bulkDelete(tripId, ids);
    await offlineDb.places.bulkDelete(ids);
    return result;
  },

  async updateMany(
    tripId: number | string,
    ids: number[],
    data: Record<string, unknown>
  ): Promise<{ updated: number[]; count: number; places: Place[] }> {
    if (isEffectivelyOffline()) {
      // Offline fans out one queued PUT per id (mirrors deleteMany's DELETE fan-out).
      const places: Place[] = [];
      for (const id of ids) {
        const existing = await offlineDb.places.get(id);
        if (existing) {
          const optimistic = await normalizeOptimisticCategories({ ...existing, ...(data as Partial<Place>) }, data);
          await offlineDb.places.put(optimistic);
          places.push(optimistic);
        }
        const mutId = generateUUID();
        const isTemp = id < 0;
        await mutationQueue.enqueue({
          id: mutId,
          tripId: Number(tripId),
          method: 'PUT',
          url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
          body: data,
          resource: 'places',
          entityId: id,
          baseUpdatedAt: existing?.updated_at ?? null,
          ...(isTemp ? { tempEntityId: id } : {}),
        });
      }
      return { updated: ids, count: ids.length, places };
    }
    const result = await placesApi.bulkUpdate(tripId, ids, data as Parameters<typeof placesApi.bulkUpdate>[2]);
    const places = Array.isArray(result.places) ? (result.places as Place[]) : [];
    if (places.length > 0) await offlineDb.places.bulkPut(places);
    return { ...result, places };
  },
};
