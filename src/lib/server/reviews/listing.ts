import type { Filter } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';
import { stripControlCharacters } from '$lib/utils/review-text';

export const MAX_REVIEW_SEARCH_LENGTH = 80;

export const sanitizeReviewSearch = (value: string | null | undefined): string =>
	stripControlCharacters(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_REVIEW_SEARCH_LENGTH);

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
