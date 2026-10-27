import { describe, expect, it } from 'vitest';
import { parseReviewVersion } from './version';

describe('parseReviewVersion', () => {
	it('treats a missing or empty field as no version', () => {
		expect(parseReviewVersion(null)).toBeUndefined();
		expect(parseReviewVersion('')).toBeUndefined();
	});

	it('accepts a positive millisecond timestamp', () => {
		expect(parseReviewVersion('1761400000000')).toEqual(new Date(1761400000000));
	});

	it('rejects anything else', () => {
		const file = new File(['1'], 'version.txt');
		for (const value of ['0', '-1', '1.5', '1e12', ' 1', 'abc', '9'.repeat(17), file]) {
			expect(parseReviewVersion(value)).toBe('invalid');
		}
	});
});
