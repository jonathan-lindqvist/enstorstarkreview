import { describe, expect, it } from 'vitest';
import { getReviewPublicationBadge } from './publication';

describe('getReviewPublicationBadge', () => {
	it('labels drafts with the amber presentation', () => {
		expect(getReviewPublicationBadge('draft')).toEqual({
			label: 'Utkast',
			tone: 'amber'
		});
	});

	it('labels published and legacy reviews with the green presentation', () => {
		expect(getReviewPublicationBadge('published')).toEqual({
			label: 'Publicerad',
			tone: 'green'
		});
		expect(getReviewPublicationBadge(undefined)).toEqual({
			label: 'Publicerad',
			tone: 'green'
		});
	});
});
