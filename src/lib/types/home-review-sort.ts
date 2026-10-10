import type { ReviewSort } from '$lib/utils/review-sort';

/** Distance sorting uses browser location and is available only to the web home page. */
export type HomeReviewSort = ReviewSort | 'nearest';
