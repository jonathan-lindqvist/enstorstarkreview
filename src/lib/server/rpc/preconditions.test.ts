import { describe, expect, it } from 'vitest';
import { contentETag, ifMatchMatches, ifNoneMatchMatches } from './preconditions';

describe('update preconditions (If-Match)', () => {
	const tag = '"v1-review-1234"';

	it('accepts a current strong tag within a list', () => {
		expect(ifMatchMatches(`"older", ${tag}`, tag)).toBe(true);
	});

	it.each([null, '', '*', `*, ${tag}`, `W/${tag}`, '"older"', 'v1-review-1234'])(
		'rejects %s',
		(header) => expect(ifMatchMatches(header, tag)).toBe(false)
	);
});

describe('read validation (If-None-Match)', () => {
	it.each(['W/"current"', '*', '"older", W/"current"', '"current"'])('matches %s', (header) =>
		expect(ifNoneMatchMatches(header, '"current"')).toBe(true)
	);

	it.each([null, '"older"'])('does not match %s', (header) =>
		expect(ifNoneMatchMatches(header, '"current"')).toBe(false)
	);
});

describe('content ETags', () => {
	it('is a stable quoted tag that changes with the content', () => {
		expect(contentETag('{"a":1}')).toBe(contentETag('{"a":1}'));
		expect(contentETag('{"a":1}')).not.toBe(contentETag('{"a":2}'));
		expect(contentETag('{}')).toMatch(/^"[^"]+"$/);
	});
});
