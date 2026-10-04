import { invalidatePublicReviewMapCache } from '$lib/server/review-map';
import { invalidatePublicReviewStatisticsCache } from '$lib/server/review-statistics';

export const invalidatePublicReviewCaches = (): void => {
	invalidatePublicReviewStatisticsCache();
	invalidatePublicReviewMapCache();
};
