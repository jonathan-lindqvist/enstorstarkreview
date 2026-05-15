import { describe, expect, it } from 'vitest';
import { capitalizeAuthorName, formatAuthorList, formatAuthors } from './authors';

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
