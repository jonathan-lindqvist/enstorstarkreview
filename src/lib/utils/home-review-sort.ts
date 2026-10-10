import type { HomeReviewSort } from '$lib/types/home-review-sort';
import { normalizeReviewSort, sortReviews, type SortableReview } from './review-sort';
import { isValidDistanceKm } from './review-distance';

export const normalizeHomeReviewSort = (value: string | null | undefined): HomeReviewSort =>
	value === 'nearest' ? 'nearest' : normalizeReviewSort(value);

export const sortHomeReviews = <T>(
	reviews: T[],
	sort: HomeReviewSort,
	toSortable: (review: T) => SortableReview & { distanceKm?: number | null }
): T[] => {
	if (sort !== 'nearest') return sortReviews(reviews, sort, toSortable);
	// Stable sorting retains newest-first ordering for equal and unknown distances.
	return sortReviews(reviews, 'latest', toSortable).sort((first, second) => {
		const a = toSortable(first).distanceKm;
		const b = toSortable(second).distanceKm;
		if (!isValidDistanceKm(a)) return isValidDistanceKm(b) ? 1 : 0;
		if (!isValidDistanceKm(b)) return -1;
		return a - b;
	});
};
