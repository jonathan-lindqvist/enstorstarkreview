import { describe, expect, it } from 'vitest';
import { getReviewExcerpt } from './review-excerpt';

describe('review card excerpt', () => {
	it('joins list items with middle dots like the apps', () => {
		expect(getReviewExcerpt('- Rockbar\r\n- 90s musik\r\n- Kladdigt bar')).toBe(
			'Rockbar · 90s musik · Kladdigt bar'
		);
	});

	it('flattens headings, paragraphs and ordered lists into one line', () => {
		expect(getReviewExcerpt('## Bra ställe ##\n\nFin bar\nmed utsikt.\n\n1. Billig\n2) Nära')).toBe(
			'Bra ställe Fin bar med utsikt. Billig · Nära'
		);
	});

	it('drops bold and code markers', () => {
		expect(getReviewExcerpt('**Finns en claw machine!!!** Är __segt__ med `dj`')).toBe(
			'Finns en claw machine!!! Är segt med dj'
		);
	});

	it('keeps continuation lines with their item and starts a new list after a blank line', () => {
		expect(getReviewExcerpt('- Ett\nfortsätter\n\n- Två\n* Tre')).toBe('Ett fortsätter Två · Tre');
	});

	it('returns an empty string for a blank description', () => {
		expect(getReviewExcerpt(' \n\n ')).toBe('');
	});
});
