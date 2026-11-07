import type { ApiSchemas } from './openapi';
import type { PublicReviewStatistics } from '$lib/types/review-statistics';

/** Maps the public statistics to the API shape; an unknown volume is null rather than missing. */
export const toApiStatistics = (
	statistics: PublicReviewStatistics
): ApiSchemas['ReviewStatistics'] => ({
	...statistics,
	priceComparison: statistics.priceComparison.map((point) => ({
		...point,
		beerVolumeCl: point.beerVolumeCl ?? null
	}))
});
