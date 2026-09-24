import { validateReviewRequestForm } from '$lib/server/review-requests/validation';
import { describe, expect, it } from 'vitest';

const submittedAt = new Date('2026-08-02T12:00:00.000Z');
describe('review request form validation', () => {
	it('normalizes control characters and keeps meaningful line breaks', () => {
		const data = new FormData();
		data.set('barName', '  Bar\u0000   Himmel  ');
		data.set('location', ' Göteborg\t centrum ');
		data.set('motivation', ' Första raden \r\n\r\n\r\n Andra raden\u0007 ');

		const result = validateReviewRequestForm(data, submittedAt);

		expect(result).toEqual({
			ok: true,
			submission: {
				barName: 'Bar Himmel',
				location: 'Göteborg centrum',
				motivation: 'Första raden\n\nAndra raden',
				submittedAt
			}
		});
	});

	it('returns Swedish field errors and sanitized values at every boundary', () => {
		const data = new FormData();
		data.set('barName', 'x');
		data.set('location', 'y'.repeat(161));
		data.set('motivation', 'z'.repeat(1001));

		const result = validateReviewRequestForm(data);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.values.barName).toBe('x');
		expect(result.fieldErrors).toEqual({
			barName: 'Ange barens namn med minst 2 tecken.',
			location: 'Ort eller adress får vara högst 160 tecken.',
			motivation: 'Motiveringen får vara högst 1 000 tecken.'
		});
	});
});
