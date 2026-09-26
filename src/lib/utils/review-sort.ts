export const REVIEW_SORTS = ['latest', 'oldest', 'score'] as const;

export type ReviewSort = (typeof REVIEW_SORTS)[number];

export interface SortableReview {
	id: string;
	createdAt: Date | string;
	rating: number;
}

export const normalizeReviewSort = (value: string | null | undefined): ReviewSort =>
	REVIEW_SORTS.includes(value as ReviewSort) ? (value as ReviewSort) : 'latest';

const getCreatedTime = (review: SortableReview) => {
	const createdTime = new Date(review.createdAt).getTime();
	return Number.isFinite(createdTime) ? createdTime : 0;
};

const compareByCreated = (
	first: SortableReview,
	second: SortableReview,
	direction: 'asc' | 'desc'
) => {
	const createdDiff = getCreatedTime(first) - getCreatedTime(second);
	if (createdDiff !== 0) {
		return direction === 'asc' ? createdDiff : -createdDiff;
	}

	return direction === 'asc'
		? first.id.localeCompare(second.id)
		: second.id.localeCompare(first.id);
};

/**
 * Sorts reviews for the home page and the API. Ties fall back to creation time and then ID,
 * so the order is stable across requests.
 */
export const sortReviews = <T>(
	reviews: T[],
	sort: ReviewSort,
	toSortable: (review: T) => SortableReview
): T[] =>
	[...reviews].sort((firstReview, secondReview) => {
		const first = toSortable(firstReview);
		const second = toSortable(secondReview);

		if (sort === 'score') {
			const ratingDiff = second.rating - first.rating;
			if (ratingDiff !== 0) return ratingDiff;
			return compareByCreated(first, second, 'desc');
		}

		return compareByCreated(first, second, sort === 'oldest' ? 'asc' : 'desc');
	});
