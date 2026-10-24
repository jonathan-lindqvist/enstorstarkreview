import type { Filter } from 'mongodb';
import type { BarReview } from '#lib/types/bar-review.js';
export { MAX_REVIEW_SEARCH_LENGTH, sanitizeReviewSearch } from '#lib/utils/review-search.js';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive match on the fields that the home page search covers. */
export const buildReviewSearchFilter = (search: string): Filter<BarReview> => {
	if (!search) return {};

	const pattern = { $regex: escapeRegex(search), $options: 'i' };
	return {
		$or: [
			{ title: pattern },
			{ location: pattern },
			{ description: pattern },
			{ beerBrand: pattern },
			{ author: pattern },
			{ coAuthors: pattern }
		]
	};
};
