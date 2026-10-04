import { describe, expect, it } from 'vitest';
import { serializeReview } from './serialization';
import { createExistingReview } from './test-fixtures';

describe('review serialization', () => {
	it('serializes attributes and defaults missing legacy values to empty', () => {
		expect(
			serializeReview(createExistingReview({ attributes: ['quiz', 'darts'] })).attributes
		).toEqual(['quiz', 'darts']);
		expect(serializeReview(createExistingReview()).attributes).toEqual([]);
	});
});
