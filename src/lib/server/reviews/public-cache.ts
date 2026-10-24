import { invalidatePublicReviewMapCache } from '#lib/server/review-map.js';
import { invalidatePublicReviewStatisticsCache } from '#lib/server/review-statistics.js';

export const invalidatePublicReviewCaches = (): void => {
	invalidatePublicReviewStatisticsCache();
	invalidatePublicReviewMapCache();
};
