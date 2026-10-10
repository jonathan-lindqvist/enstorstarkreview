import type { Filter, FindOptions } from 'mongodb';
import type { MapGeocode } from '$lib/types/map-geocode';
import type { Coordinates } from '$lib/types/review-location';
import { hasValidCoordinates, normalizeMapAddress } from './address';

interface ResolvedGeocodeCollection {
	find(filter: Filter<MapGeocode>, options: FindOptions): { toArray(): Promise<unknown[]> };
}

/** Read saved results only; callers must supply addresses from already-authorized reviews. */
export const createResolvedCoordinatesLoader =
	(collection: ResolvedGeocodeCollection) =>
	async (addresses: string[]): Promise<Map<string, Coordinates>> => {
		const addressKeys = new Set(addresses.map(normalizeMapAddress).filter(Boolean));
		const coordinates = new Map<string, Coordinates>();
		if (!addressKeys.size) return coordinates;
		const geocodes = await collection
			.find(
				{ addressKey: { $in: [...addressKeys] }, status: 'resolved' },
				{ projection: { _id: 0, addressKey: 1, status: 1, latitude: 1, longitude: 1 } }
			)
			.toArray();
		for (const value of geocodes) {
			if (!value || typeof value !== 'object') continue;
			const geocode = value as Partial<MapGeocode>;
			const { addressKey, status } = geocode;
			if (
				status === 'resolved' &&
				typeof addressKey === 'string' &&
				addressKeys.has(addressKey) &&
				hasValidCoordinates(geocode)
			) {
				coordinates.set(addressKey, {
					latitude: geocode.latitude,
					longitude: geocode.longitude
				});
			}
		}
		return coordinates;
	};
