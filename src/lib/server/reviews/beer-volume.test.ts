import { describe, expect, it } from 'vitest';
import { buildReviewFormData, validateReviewFormData } from './form';
import { buildReviewPersistenceFields } from './persistence';
import { buildReviewChangeLog } from './history';
import { createExistingReview, createValidReviewForm } from './test-fixtures';

describe('optional serving size', () => {
	it.each([1, 33, 40, 50, 200])('persists %i cl', (volume) => {
		const data = createValidReviewForm();
		data.set('beer-volume', String(volume));
		expect(validateReviewFormData(data).ok).toBe(true);
		expect(buildReviewPersistenceFields(buildReviewFormData(data), 'current')).toMatchObject({
			beerVolumeCl: volume
		});
	});
	it('allows unknown size and explicitly clearing a size', () => {
		const data = createValidReviewForm();
		for (const blank of [undefined, '', '  ']) {
			if (blank === undefined) data.delete('beer-volume');
			else data.set('beer-volume', blank);
			expect(validateReviewFormData(data).ok).toBe(true);
			expect(buildReviewPersistenceFields(buildReviewFormData(data), 'current')).toMatchObject({
				beerVolumeCl: null
			});
		}
	});
	it.each(['0', '-1', '201', '33.5', 'NaN', 'Infinity', 'unknown'])('rejects size %s', (volume) => {
		const data = createValidReviewForm();
		data.set('beer-volume', volume);
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			problem: { status: 400, pointer: '/beer-volume' }
		});
	});
	it('rejects a file disguised as size', () => {
		const data = createValidReviewForm();
		data.set('beer-volume', new File(['50'], 'size.txt'));
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-volume' }
		});
	});
	it('restores the size when another field is rejected', () => {
		const data = createValidReviewForm({ description: '' });
		data.set('beer-volume', '50');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { beerVolumeCl: 50 }
		});
	});
	it('records additions and clearing without spurious legacy changes', () => {
		const data = createValidReviewForm();
		const now = new Date('2026-01-03T00:00:00Z');
		const legacy = createExistingReview();
		expect(
			buildReviewChangeLog(
				legacy,
				buildReviewPersistenceFields(buildReviewFormData(data), 'current'),
				now,
				'current'
			)
		).toEqual([]);
		data.set('beer-volume', '50');
		const next = buildReviewPersistenceFields(buildReviewFormData(data), 'current');
		expect(buildReviewChangeLog(legacy, next, now, 'current')[0]?.changes).toContainEqual({
			field: 'beerVolumeCl',
			label: 'Volym för en stor stark',
			before: 'Tom',
			after: '50 cl'
		});
		data.set('beer-volume', '');
		expect(
			buildReviewChangeLog(
				{ ...legacy, beerVolumeCl: 50 },
				buildReviewPersistenceFields(buildReviewFormData(data), 'current'),
				now,
				'current'
			)[0]?.changes
		).toContainEqual({
			field: 'beerVolumeCl',
			label: 'Volym för en stor stark',
			before: '50 cl',
			after: 'Tom'
		});
	});
});
