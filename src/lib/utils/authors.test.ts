import { describe, expect, it } from 'vitest';
import {
	capitalizeAuthorName,
	formatAuthorList,
	formatAuthors,
	getReviewAuthors,
	getReviewAuthorOptions
} from './authors';

describe('author checklist options', () => {
	it('shows the editor first and sorts other users alphabetically', () => {
		expect(getReviewAuthorOptions('editor', ['östen', 'zoe', 'adam', 'editor', 'åke'])).toEqual([
			'editor',
			'adam',
			'zoe',
			'åke',
			'östen'
		]);
		expect(getReviewAuthorOptions('editor', [])).toEqual(['editor']);
	});

	it('keeps all existing credits in order, including deleted users, without duplicates', () => {
		const review = {
			author: 'former-primary',
			coAuthors: ['zoe', 'former-coauthor', 'editor', 'zoe']
		};
		expect(getReviewAuthorOptions('editor', ['zoe', 'adam', 'editor'], review)).toEqual([
			'editor',
			'former-primary',
			'zoe',
			'former-coauthor',
			'adam'
		]);
		expect(getReviewAuthorOptions('editor', [], review)).toEqual([
			'editor',
			'former-primary',
			'zoe',
			'former-coauthor'
		]);
	});

	it('accepts legacy string co-authors and missing co-authors', () => {
		expect(getReviewAuthors({ author: 'alice', coAuthors: 'bob' })).toEqual(['alice', 'bob']);
		expect(getReviewAuthors({ author: 'alice' })).toEqual(['alice']);
	});
});

describe('capitalizeAuthorName', () => {
	it('capitalizes the first letter of a name', () => {
		expect(capitalizeAuthorName('jonathan')).toBe('Jonathan');
	});

	it('leaves an empty string unchanged', () => {
		expect(capitalizeAuthorName('')).toBe('');
	});
});

describe('formatAuthorList', () => {
	it('capitalizes co-authors from a string', () => {
		expect(formatAuthorList('sara')).toBe('Sara');
	});

	it('capitalizes co-authors from an array', () => {
		expect(formatAuthorList(['sara', 'bob'])).toBe('Sara, Bob');
	});
});

describe('formatAuthors', () => {
	it('capitalizes the main author only', () => {
		expect(formatAuthors('jonathan')).toBe('Jonathan');
	});

	it('capitalizes the main author and co-authors', () => {
		expect(formatAuthors('jonathan', 'sara')).toBe('Jonathan, Sara');
		expect(formatAuthors('jonathan', ['sara', 'bob'])).toBe('Jonathan, Sara, Bob');
	});
});
