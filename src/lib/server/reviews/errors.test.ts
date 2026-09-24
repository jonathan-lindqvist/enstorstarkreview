import { isDuplicateSlugError } from '$lib/server/reviews/errors';
import { describe, expect, it } from 'vitest';

describe('errors', () => {
	it('isDuplicateSlugError identifies mongodb duplicate key errors', () => {
		expect(isDuplicateSlugError({ code: 11000 })).toBe(true);
		expect(isDuplicateSlugError({ code: 12345 })).toBe(false);
		expect(isDuplicateSlugError(null)).toBe(false);
	});
});
