import type { Filter } from 'mongodb';
import { mapGeocodes } from '$lib/db/map-geocodes';
import type { StatisticsRegion } from '$lib/statistics-regions';
import type { BarReview } from '$lib/types/bar-review';
import { normalizeMapAddress } from '$lib/utils/map-address';
import { createAsyncCache } from './async-cache';
import { createResolvedCoordinatesLoader } from './map/coordinates';
import { listPublicReviewLocations } from './reviews/queries';

type RegionalScope = Exclude<StatisticsRegion, 'varlden'>;

const loadCoordinates = createResolvedCoordinatesLoader(mapGeocodes);

const loadRegionalAddresses = async (): Promise<Record<RegionalScope, string[]>> => {
	const addresses = (await listPublicReviewLocations()).filter(
		(address) => typeof address === 'string'
	);
	const coordinates = await loadCoordinates(addresses);
	const regions: Record<RegionalScope, string[]> = { goteborg: [], sverige: [] };
	if (!coordinates.size) return regions;

	const { classifyStatisticsRegion } = await import('./statistics-geography');
	for (const address of addresses) {
		const position = coordinates.get(normalizeMapAddress(address));
		if (!position) continue;
		const region = classifyStatisticsRegion(position);
		if (region === 'goteborg') regions.goteborg.push(address);
		if (region !== 'varlden') regions.sverige.push(address);
	}
	return regions;
};

export const createRegionalStatisticsFilter = (ttlMs: number) => {
	const cache = createAsyncCache({ load: loadRegionalAddresses, ttlMs });
	return {
		get: async (region: RegionalScope): Promise<Filter<BarReview> | null> => {
			const addresses = (await cache.get())[region];
			if (!addresses.length) return null;
			// Match the saved address exactly so edits cannot reuse the previous address's region.
			return { $expr: { $in: ['$location', { $literal: addresses }] } };
		},
		invalidate: cache.invalidate
	};
};
