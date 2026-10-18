import { BEER_BRANDS, MAX_BEER_BRAND_LENGTH, OTHER_BEER_BRAND_VALUE } from '$lib/beer-brands';
import { getReviewRatingValues, REVIEW_RATING_FIELD_NAMES } from '$lib/review-metadata';
import { buildReviewAuthorship } from '$lib/server/reviews/authorship';
import {
	buildReviewFormData,
	hasInvalidOverallRating,
	hasInvalidRatingValues,
	normalizeImageFocus,
	validateReviewFormData
} from '$lib/server/reviews/form';
import { buildReviewPersistenceFields } from '$lib/server/reviews/persistence';
import { describe, expect, it } from 'vitest';

import { createValidReviewForm } from '$lib/server/reviews/test-fixtures';

describe('form', () => {
	it('normalizes submitted attributes and preserves them after other validation errors', () => {
		const data = createValidReviewForm({ 'bar-name': '' });
		for (const value of ['darts', 'quiz', 'invalid', 'darts']) data.append('attributes', value);
		data.append('attributes', new Blob(['quiz']), 'quiz.txt');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { attributes: ['quiz', 'darts'] }
		});
		data.delete('attributes');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { attributes: [] }
		});
	});

	it('reads the full author selection without adding the editor or changing usernames', () => {
		const data = createValidReviewForm();
		data.delete('authors');
		for (const name of ['sara', 'bob', 'sara', ' legacy name ']) data.append('authors', name);
		expect(buildReviewFormData(data).authors).toEqual(['sara', 'bob', ' legacy name ']);
	});

	it('rejects an empty selection and retains it on validation errors', () => {
		const data = createValidReviewForm();
		data.delete('authors');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { authors: [] },
			problem: { pointer: '/authors', message: 'Välj minst en författare' }
		});
		data.set('bar-name', '');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { authors: [] },
			problem: { pointer: '/bar-name' }
		});
		expect(() => buildReviewAuthorship([], 'editor')).toThrow('At least one author');
	});

	it('retains selections without re-adding the editor after other validation errors', () => {
		const data = createValidReviewForm({ 'bar-name': '' });
		data.set('authors', 'sara');
		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			formData: { authors: ['sara'] }
		});
	});

	it('normalizeImageFocus defaults invalid values and clamps to 0..100', () => {
		expect(normalizeImageFocus(null)).toBe(50);
		expect(normalizeImageFocus('not-a-number')).toBe(50);
		expect(normalizeImageFocus('-20')).toBe(0);
		expect(normalizeImageFocus('125')).toBe(100);
		expect(normalizeImageFocus('24.5')).toBe(24.5);
	});

	it('buildReviewFormData preserves submitted image focus values', () => {
		const data = new FormData();
		data.set('bar-name', 'Focus Bar');
		data.set('description', 'Description');
		data.set('address', 'Address');
		data.set('slug', 'focus-bar');
		data.set('beer-brand', 'Falcon Export');
		data.set('beer-price', '79');
		data.set('happy-hour-price', 'on');
		data.set('rating', '2');
		data.set('atmosphere', '1');
		data.set('service', '2');
		data.set('selection', '3');
		data.set('quality', '4');
		data.set('price', '5');
		data.set('cleanliness', '4');
		data.set('soundLevel', '3');
		data.set('barhopPotential', '2');
		data.set('imageFocusX', '12.25');
		data.set('imageFocusY', '98.75');

		expect(buildReviewFormData(data)).toMatchObject({
			beerBrandSelection: 'Falcon Export',
			customBeerBrand: '',
			beerPriceKr: 79,
			isHappyHourPrice: true,
			imageFocusX: 12.25,
			imageFocusY: 98.75
		});
	});

	it('buildReviewFormData parses beer price and unchecked happy hour prices', () => {
		expect(buildReviewFormData(createValidReviewForm())).toMatchObject({
			beerPriceKr: 79,
			isHappyHourPrice: false
		});
	});

	it('buildReviewFormData defaults missing image focus values', () => {
		expect(buildReviewFormData(new FormData())).toMatchObject({
			imageFocusX: 50,
			imageFocusY: 50
		});
	});

	it('derives rating field names and values from review metadata', () => {
		const formData = buildReviewFormData(createValidReviewForm());

		expect(REVIEW_RATING_FIELD_NAMES).toBe(
			'atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential'
		);
		expect(getReviewRatingValues(formData)).toEqual([1, 2, 3, 4, 5, 4, 3, 2]);
	});

	it('validateReviewFormData accepts valid normalized review data', () => {
		const result = validateReviewFormData(createValidReviewForm());

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.formData).toMatchObject({
				barName: 'Focus Bar',
				description: 'Description',
				address: 'Address',
				slug: 'focus-bar',
				beerBrandSelection: 'Falcon Export',
				customBeerBrand: '',
				beerPriceKr: 79,
				isHappyHourPrice: false
			});
		}
	});

	it('defines the supported beer brands in display order', () => {
		expect(BEER_BRANDS).toEqual([
			'Norrlands Guld Export',
			'Falcon Export',
			'Mariestads Export',
			'Pripps Blå Export',
			'Eriksberg Original',
			'Eriksberg Karaktär',
			'Åbro Original',
			'Sofiero Original',
			'Spendrups Premium Gold',
			'Carlsberg Export',
			'Heineken',
			'Staropramen',
			'Grängesberg',
			'Ey’Bro',
			'Melleruds Utmärkta Pilsner'
		]);
	});

	it('accepts and sanitizes a custom beer brand', () => {
		const result = validateReviewFormData(
			createValidReviewForm({
				'beer-brand': OTHER_BEER_BRAND_VALUE,
				'custom-beer-brand': '  Husets\u0000   Lager  '
			})
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.formData).toMatchObject({
				beerBrandSelection: OTHER_BEER_BRAND_VALUE,
				customBeerBrand: 'Husets Lager'
			});
			expect(buildReviewPersistenceFields(result.formData, 'current').beerBrand).toBe(
				'Husets Lager'
			);
		}
	});

	it('rejects missing, manipulated, and incomplete custom beer selections', () => {
		const missing = createValidReviewForm();
		missing.delete('beer-brand');
		expect(validateReviewFormData(missing)).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-brand', message: 'Välj vilken öl som serveras' }
		});

		expect(
			validateReviewFormData(createValidReviewForm({ 'beer-brand': 'Manipulerad öl' }))
		).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-brand', message: 'Välj vilken öl som serveras' }
		});

		expect(
			validateReviewFormData(createValidReviewForm({ 'beer-brand': OTHER_BEER_BRAND_VALUE }))
		).toMatchObject({
			ok: false,
			problem: { pointer: '/custom-beer-brand', message: 'Ange ett giltigt ölnamn' }
		});
	});

	it('rejects custom beer names over the maximum length', () => {
		expect(
			validateReviewFormData(
				createValidReviewForm({
					'beer-brand': OTHER_BEER_BRAND_VALUE,
					'custom-beer-brand': 'x'.repeat(MAX_BEER_BRAND_LENGTH + 1)
				})
			)
		).toMatchObject({
			ok: false,
			problem: { pointer: '/custom-beer-brand', message: 'Ange ett giltigt ölnamn' }
		});
	});

	it('validateReviewFormData rejects invalid common text fields', () => {
		expect(validateReviewFormData(createValidReviewForm({ 'bar-name': '' }))).toMatchObject({
			ok: false,
			problem: { pointer: '/bar-name', message: 'Ogiltigt namn på baren' }
		});
		expect(
			validateReviewFormData(createValidReviewForm({ description: 'x'.repeat(20001) }))
		).toMatchObject({
			ok: false,
			problem: { pointer: '/description', message: 'Ogiltig beskrivning' }
		});
	});

	it('validateReviewFormData rejects missing beer prices', () => {
		const data = createValidReviewForm();
		data.delete('beer-price');

		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-price', message: 'Ogiltigt pris' }
		});
	});

	it.each([
		['non-numeric', 'abc'],
		['decimal', '79.5'],
		['zero', '0'],
		['negative', '-1'],
		['too large', '1000']
	])('validateReviewFormData rejects %s beer prices', (_label, beerPrice) => {
		expect(
			validateReviewFormData(createValidReviewForm({ 'beer-price': beerPrice }))
		).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-price', message: 'Ogiltigt pris' }
		});
	});

	it('validateReviewFormData rejects invalid slug and too many authors', () => {
		expect(validateReviewFormData(createValidReviewForm({ slug: '' }))).toMatchObject({
			ok: false,
			problem: { pointer: '/slug', message: 'Ogiltig slug' }
		});

		const data = createValidReviewForm();
		for (let index = 0; index < 51; index += 1) {
			data.append('authors', `author-${index}`);
		}

		expect(validateReviewFormData(data)).toMatchObject({
			ok: false,
			problem: { pointer: '/authors', message: 'För många författare' }
		});
	});

	it('validateReviewFormData rejects invalid detail and overall ratings', () => {
		expect(validateReviewFormData(createValidReviewForm({ atmosphere: '6' }))).toMatchObject({
			ok: false,
			problem: { pointer: '/', message: 'Ogiltiga betyg' }
		});
		expect(validateReviewFormData(createValidReviewForm({ rating: '4' }))).toMatchObject({
			ok: false,
			problem: { pointer: '/rating', message: 'Ogiltigt helhetsbetyg' }
		});
	});

	it('validateReviewFormData can keep create rating validation before detail fields', () => {
		expect(
			validateReviewFormData(createValidReviewForm({ atmosphere: '6', address: '' }), {
				invalidRatingMessage: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
				ratingValidationPosition: 'beforeDetails'
			})
		).toMatchObject({
			ok: false,
			problem: {
				pointer: '/',
				message: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`
			}
		});
	});

	it('hasInvalidRatingValues validates 0..5 and rejects NaN', () => {
		expect(hasInvalidRatingValues([0, 1, 2, 3, 4, 5, 2.5])).toBe(false);
		expect(hasInvalidRatingValues([0, 6])).toBe(true);
		expect(hasInvalidRatingValues([-1, 2])).toBe(true);
		expect(hasInvalidRatingValues([Number.NaN, 2])).toBe(true);
	});

	it('hasInvalidOverallRating validates integer scores from 0 to 3', () => {
		expect(hasInvalidOverallRating(0)).toBe(false);
		expect(hasInvalidOverallRating(3)).toBe(false);
		expect(hasInvalidOverallRating(1.5)).toBe(true);
		expect(hasInvalidOverallRating(4)).toBe(true);
		expect(hasInvalidOverallRating(Number.NaN)).toBe(true);
	});
});
