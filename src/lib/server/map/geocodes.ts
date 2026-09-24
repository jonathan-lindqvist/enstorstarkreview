import type { Filter, UpdateFilter, OptionalUnlessRequiredId } from 'mongodb';
import type { MapGeocode } from '$lib/types/map-geocode';
import {
	MAP_GEOCODE_LOCK_MS,
	MAP_GEOCODE_STRATEGY_VERSION,
	MAP_GEOCODE_NOT_FOUND_RETRY_MS,
	MAP_GEOCODE_RETRY_MS
} from './policy';

interface GeocodeCollection {
	findOne(filter: Filter<MapGeocode>): Promise<MapGeocode | null>;
	insertOne(geocode: OptionalUnlessRequiredId<MapGeocode>): Promise<unknown>;
	updateOne(
		filter: Filter<MapGeocode>,
		update: UpdateFilter<MapGeocode>
	): Promise<{ modifiedCount: number }>;
}
export const createGeocodeStore = (mapGeocodes: GeocodeCollection, now = () => new Date()) => {
	const claimGeocode = async (address: string, addressKey: string): Promise<boolean> => {
		const currentTime = now();
		const lockUntil = new Date(currentTime.getTime() + MAP_GEOCODE_LOCK_MS);
		const existing = await mapGeocodes.findOne({ addressKey });

		if (existing?.status === 'resolved') return false;
		const hasStaleNegativeResult =
			(existing?.status === 'not_found' || existing?.status === 'failed') &&
			(existing.strategyVersion ?? 0) < MAP_GEOCODE_STRATEGY_VERSION;
		if (existing?.retryAt && existing.retryAt > currentTime && !hasStaleNegativeResult)
			return false;

		if (!existing) {
			try {
				await mapGeocodes.insertOne({
					addressKey,
					address,
					status: 'pending',
					strategyVersion: MAP_GEOCODE_STRATEGY_VERSION,
					retryAt: lockUntil,
					updatedAt: currentTime
				});
				return true;
			} catch (error) {
				if (!(error instanceof Error) || !error.message.includes('duplicate key')) throw error;
				return false;
			}
		}

		const result = await mapGeocodes.updateOne(
			{
				addressKey,
				status: { $ne: 'resolved' },
				$or: [
					{
						status: { $in: ['not_found', 'failed'] },
						$or: [
							{ strategyVersion: { $exists: false } },
							{ strategyVersion: { $lt: MAP_GEOCODE_STRATEGY_VERSION } }
						]
					},
					{ retryAt: { $exists: false } },
					{ retryAt: { $lte: currentTime } }
				]
			},
			{
				$set: {
					address,
					status: 'pending',
					strategyVersion: MAP_GEOCODE_STRATEGY_VERSION,
					retryAt: lockUntil,
					updatedAt: currentTime
				}
			}
		);
		return result.modifiedCount === 1;
	};

	const saveResolvedGeocode = async (
		addressKey: string,
		coordinates: { latitude: number; longitude: number }
	): Promise<void> => {
		await mapGeocodes.updateOne(
			{ addressKey },
			{
				$set: {
					status: 'resolved',
					strategyVersion: MAP_GEOCODE_STRATEGY_VERSION,
					latitude: coordinates.latitude,
					longitude: coordinates.longitude,
					updatedAt: now()
				},
				$unset: { retryAt: '' }
			}
		);
	};

	const saveUnresolvedGeocode = async (
		addressKey: string,
		status: 'not_found' | 'failed'
	): Promise<void> => {
		const retryMs = status === 'not_found' ? MAP_GEOCODE_NOT_FOUND_RETRY_MS : MAP_GEOCODE_RETRY_MS;
		await mapGeocodes.updateOne(
			{ addressKey },
			{
				$set: {
					status,
					strategyVersion: MAP_GEOCODE_STRATEGY_VERSION,
					retryAt: new Date(now().getTime() + retryMs),
					updatedAt: now()
				},
				$unset: { latitude: '', longitude: '' }
			}
		);
	};

	return {
		claim: claimGeocode,
		saveResolved: saveResolvedGeocode,
		saveUnresolved: saveUnresolvedGeocode
	};
};
