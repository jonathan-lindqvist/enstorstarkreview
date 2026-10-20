import { stripControlCharacters } from './review-text';

export const MAX_REVIEW_SEARCH_LENGTH = 80;

export const sanitizeReviewSearch = (value: string | null | undefined): string =>
	stripControlCharacters(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_REVIEW_SEARCH_LENGTH);
