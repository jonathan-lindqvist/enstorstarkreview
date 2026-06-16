import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { join } from 'path';
import { ObjectId } from 'mongodb';
import { REVIEW_RATING_FIELD_NAMES, REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type { BarReview } from '$lib/types/bar-review';
import {
	buildEditedReviewAuthorship,
	buildReviewChangeLog,
	buildReviewFormData,
	buildReviewPersistenceFields,
	getReviewRatingValues,
	hasInvalidOverallRating,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	normalizeCoAuthors,
	normalizeImageFocus,
	sanitizeLongText,
	sanitizePlainText,
	sanitizeSlug,
	validateReviewCoAuthors,
	validateReviewFormData
} from './review-form';
import {
	getImageExtension,
	getReviewImageMimeType,
	getReviewImagePath,
	isReviewImageFilename,
	matchesImageSignature,
	sanitizeReviewImage,
	uploadReviewImage
} from './review-images';

const createImageWithExif = async (mimeType: string): Promise<Buffer> => {
	const image = sharp({
		create: {
			width: 2,
			height: 2,
			channels: 3,
			background: { r: 220, g: 40, b: 40 }
		}
	}).withExif({
		IFD0: {
			Artist: 'tracking-data',
			Copyright: 'private-metadata'
		}
	});

	if (mimeType === 'image/jpeg') return image.jpeg().toBuffer();
	if (mimeType === 'image/png') return image.png().toBuffer();
	if (mimeType === 'image/webp') return image.webp().toBuffer();
	throw new Error(`Unsupported fixture type: ${mimeType}`);
};

const createValidReviewForm = (overrides: Record<string, string> = {}): FormData => {
	const data = new FormData();
	data.set('bar-name', overrides['bar-name'] ?? 'Focus Bar');
	data.set('description', overrides.description ?? 'Description');
	data.set('address', overrides.address ?? 'Address');
	data.set('slug', overrides.slug ?? 'focus-bar');
	data.set('beer-price', overrides['beer-price'] ?? '79');
	if (overrides['happy-hour-price']) {
		data.set('happy-hour-price', overrides['happy-hour-price']);
	}
	data.set('rating', overrides.rating ?? '2');
	data.set('imageFocusX', overrides.imageFocusX ?? '50');
	data.set('imageFocusY', overrides.imageFocusY ?? '50');

	const ratingDefaults: Record<string, string> = {
		atmosphere: '1',
		service: '2',
		selection: '3',
		quality: '4',
		price: '5',
		cleanliness: '4',
		soundLevel: '3',
		barhopPotential: '2'
	};

	for (const metric of REVIEW_RATING_METRICS) {
		data.set(metric.key, overrides[metric.key] ?? ratingDefaults[metric.key]);
	}

	return data;
};

const createExistingReview = (overrides: Partial<BarReview> = {}): BarReview => ({
	_id: new ObjectId(),
	title: 'Focus Bar',
	description: 'Description',
	atmosphere: 1,
	service: 2,
	selection: 3,
	quality: 4,
	price: 5,
	cleanliness: 4,
	soundLevel: 3,
	barhopPotential: 2,
	rating: 2,
	image: 'old.jpg',
	imageFocusX: 50,
	imageFocusY: 50,
	location: 'Address',
	slug: 'focus-bar',
	beerPriceKr: 79,
	isHappyHourPrice: false,
	author: 'current',
	coAuthors: [],
	changeLog: [],
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-02T00:00:00Z'),
	...overrides
});

const buildValidPersistenceFields = (overrides: Record<string, string> = {}) =>
	buildReviewPersistenceFields(buildReviewFormData(createValidReviewForm(overrides), 'current'));

describe('review-form helpers', () => {
	it('sanitizePlainText removes control chars and normalizes whitespace', () => {
		expect(sanitizePlainText('  Foo\u0000\n\tBar   Baz  ')).toBe('Foo Bar Baz');
	});

	it('sanitizeLongText removes control chars but keeps line breaks', () => {
		expect(sanitizeLongText('\u0000Line 1\nLine 2\n')).toBe('Line 1\nLine 2');
	});

	it('sanitizeSlug keeps letters, digits, accents, and hyphens', () => {
		expect(sanitizeSlug('  Café åäö ! test---slug  ')).toBe('Café-åäö-test-slug');
	});

	it('normalizeCoAuthors deduplicates, trims, and excludes current user', () => {
		const values = [
			' sara ',
			'bob',
			'sara',
			'current',
			'',
			'   ',
			123 as unknown as FormDataEntryValue
		];
		expect(normalizeCoAuthors(values, 'current')).toEqual(['sara', 'bob']);
	});

	it('buildEditedReviewAuthorship transfers primary authorship to the current editor', () => {
		expect(buildEditedReviewAuthorship('a', 'c', ['b', 'c'])).toEqual({
			author: 'c',
			coAuthors: ['a', 'b']
		});
	});

	it('buildEditedReviewAuthorship does not duplicate the previous primary author', () => {
		expect(buildEditedReviewAuthorship('a', 'c', ['a', 'b', 'c', 'a'])).toEqual({
			author: 'c',
			coAuthors: ['a', 'b']
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

		expect(buildReviewFormData(data, 'current')).toMatchObject({
			beerPriceKr: 79,
			isHappyHourPrice: true,
			imageFocusX: 12.25,
			imageFocusY: 98.75
		});
	});

	it('buildReviewFormData parses beer price and unchecked happy hour prices', () => {
		expect(buildReviewFormData(createValidReviewForm(), 'current')).toMatchObject({
			beerPriceKr: 79,
			isHappyHourPrice: false
		});
	});

	it('buildReviewFormData defaults missing image focus values', () => {
		expect(buildReviewFormData(new FormData(), 'current')).toMatchObject({
			imageFocusX: 50,
			imageFocusY: 50
		});
	});

	it('derives rating field names and values from review metadata', () => {
		const formData = buildReviewFormData(createValidReviewForm(), 'current');

		expect(REVIEW_RATING_FIELD_NAMES).toBe(
			'atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential'
		);
		expect(getReviewRatingValues(formData)).toEqual([1, 2, 3, 4, 5, 4, 3, 2]);
	});

	it('validateReviewFormData accepts valid normalized review data', () => {
		const result = validateReviewFormData(createValidReviewForm(), 'current');

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.formData).toMatchObject({
				barName: 'Focus Bar',
				description: 'Description',
				address: 'Address',
				slug: 'focus-bar',
				beerPriceKr: 79,
				isHappyHourPrice: false
			});
		}
	});

	it('validateReviewFormData rejects invalid common text fields', () => {
		expect(
			validateReviewFormData(createValidReviewForm({ 'bar-name': '' }), 'current')
		).toMatchObject({
			ok: false,
			problem: { pointer: '/bar-name', message: 'Ogiltigt namn på baren' }
		});
		expect(
			validateReviewFormData(createValidReviewForm({ description: 'x'.repeat(20001) }), 'current')
		).toMatchObject({
			ok: false,
			problem: { pointer: '/description', message: 'Ogiltig beskrivning' }
		});
	});

	it('validateReviewFormData rejects missing beer prices', () => {
		const data = createValidReviewForm();
		data.delete('beer-price');

		expect(validateReviewFormData(data, 'current')).toMatchObject({
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
			validateReviewFormData(createValidReviewForm({ 'beer-price': beerPrice }), 'current')
		).toMatchObject({
			ok: false,
			problem: { pointer: '/beer-price', message: 'Ogiltigt pris' }
		});
	});

	it('validateReviewFormData rejects invalid slug and too many co-authors', () => {
		expect(validateReviewFormData(createValidReviewForm({ slug: '' }), 'current')).toMatchObject({
			ok: false,
			problem: { pointer: '/slug', message: 'Ogiltig slug' }
		});

		const data = createValidReviewForm();
		for (let index = 0; index < 51; index += 1) {
			data.append('co-authors', `author-${index}`);
		}

		expect(validateReviewFormData(data, 'current')).toMatchObject({
			ok: false,
			problem: { pointer: '/co-authors', message: 'För många medförfattare' }
		});
	});

	it('validateReviewFormData rejects invalid detail and overall ratings', () => {
		expect(
			validateReviewFormData(createValidReviewForm({ atmosphere: '6' }), 'current')
		).toMatchObject({
			ok: false,
			problem: { pointer: '/', message: 'Ogiltiga betyg' }
		});
		expect(validateReviewFormData(createValidReviewForm({ rating: '4' }), 'current')).toMatchObject(
			{
				ok: false,
				problem: { pointer: '/rating', message: 'Ogiltigt helhetsbetyg' }
			}
		);
	});

	it('validateReviewFormData can keep create rating validation before detail fields', () => {
		expect(
			validateReviewFormData(createValidReviewForm({ atmosphere: '6', address: '' }), 'current', {
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

	it('validateReviewCoAuthors rejects unknown co-authors', async () => {
		await expect(
			validateReviewCoAuthors(['sara', 'bob'], async () => ['sara'])
		).resolves.toMatchObject({
			pointer: '/co-authors',
			message: 'En eller flera medförfattare är ogiltiga'
		});
		await expect(validateReviewCoAuthors(['sara'], async () => ['sara'])).resolves.toBeNull();
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

	it('buildReviewPersistenceFields includes beer price fields', () => {
		const fields = buildReviewPersistenceFields(
			buildReviewFormData(
				createValidReviewForm({ 'beer-price': '89', 'happy-hour-price': 'on' }),
				'current'
			)
		);

		expect(fields).toMatchObject({
			beerPriceKr: 89,
			isHappyHourPrice: true
		});
	});

	it('getImageExtension returns extension for allowed mime types', () => {
		expect(getImageExtension('image/jpeg')).toBe('jpg');
		expect(getImageExtension('image/png')).toBe('png');
		expect(getImageExtension('image/webp')).toBe('webp');
		expect(getImageExtension('image/gif')).toBeUndefined();
		expect(getImageExtension('application/pdf')).toBeUndefined();
	});

	it('recognizes persisted review image filenames and MIME types', () => {
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.jpg')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.jpeg')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.png')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.webp')).toBe(true);
		expect(isReviewImageFilename('../6a1e9d487d43112acf4a0c36.jpg')).toBe(false);
		expect(isReviewImageFilename('not-an-object-id.jpg')).toBe(false);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.gif')).toBe(false);

		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.jpg')).toBe('image/jpeg');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.jpeg')).toBe('image/jpeg');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.png')).toBe('image/png');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.webp')).toBe('image/webp');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.gif')).toBeUndefined();
	});

	it('uses the production uploads directory for persisted review images', () => {
		const originalReviewImageDir = process.env.REVIEW_IMAGE_DIR;
		const originalNodeEnv = process.env.NODE_ENV;
		const filename = '6a1e9d487d43112acf4a0c36.jpg';

		try {
			process.env.NODE_ENV = 'production';
			delete process.env.REVIEW_IMAGE_DIR;

			expect(getReviewImagePath(filename)).toBe(join('/app/uploads/images', filename));
		} finally {
			if (originalReviewImageDir === undefined) {
				delete process.env.REVIEW_IMAGE_DIR;
			} else {
				process.env.REVIEW_IMAGE_DIR = originalReviewImageDir;
			}

			if (originalNodeEnv === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = originalNodeEnv;
			}
		}
	});

	it('matchesImageSignature validates jpeg/png/webp magic bytes and rejects gif', () => {
		expect(matchesImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(
			true
		);
		expect(
			matchesImageSignature(
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
				'image/png'
			)
		).toBe(true);

		const riffWebp = new Uint8Array([
			0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
		]);
		expect(matchesImageSignature(riffWebp, 'image/webp')).toBe(true);
		expect(
			matchesImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif')
		).toBe(false);
		expect(matchesImageSignature(new Uint8Array([0x00, 0x01, 0x02]), 'image/jpeg')).toBe(false);
	});

	it('sanitizeReviewImage strips exif metadata and keeps valid image signatures', async () => {
		for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
			const original = await createImageWithExif(mimeType);
			expect((await sharp(original).metadata()).exif).toBeDefined();

			const sanitized = await sanitizeReviewImage(original, mimeType);
			const sanitizedMetadata = await sharp(sanitized).metadata();

			expect(matchesImageSignature(sanitized, mimeType)).toBe(true);
			expect(sanitizedMetadata.exif).toBeUndefined();
		}
	});

	it('uploadReviewImage maps missing optional and required images to expected results', async () => {
		await expect(
			uploadReviewImage(null, {
				required: false,
				writeFailureMessage: 'Kunde inte uppdatera recensionen'
			})
		).resolves.toEqual({ ok: true, upload: null });

		await expect(
			uploadReviewImage(null, {
				required: true,
				writeFailureMessage: 'Kunde inte ladda upp bilden'
			})
		).resolves.toMatchObject({
			ok: false,
			problem: { pointer: '/image', message: 'Ogiltig fil' }
		});
	});

	it('uploadReviewImage rejects unsupported image types before writing', async () => {
		const result = await uploadReviewImage(new File(['gif'], 'image.gif', { type: 'image/gif' }), {
			required: true,
			writeFailureMessage: 'Kunde inte ladda upp bilden'
		});

		expect(result).toMatchObject({
			ok: false,
			problem: {
				pointer: '/image',
				message: 'Ogiltig filtyp. Endast JPEG, PNG och WebP är tillåtna'
			}
		});
	});

	it('buildReviewChangeLog omits unchanged fields and treats missing focus as default', () => {
		const existingReview = createExistingReview({
			imageFocusX: undefined,
			imageFocusY: undefined
		});
		const changeLog = buildReviewChangeLog(
			existingReview,
			buildValidPersistenceFields(),
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toEqual([]);
	});

	it('buildReviewChangeLog records scalar, array, rating, and image changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview(),
			{
				...buildValidPersistenceFields({ 'bar-name': 'New Bar', atmosphere: '5' }),
				coAuthors: ['sara'],
				image: 'new.jpg'
			},
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'editor',
			changes: expect.arrayContaining([
				{ field: 'title', label: 'Barens namn', before: 'Focus Bar', after: 'New Bar' },
				{ field: 'coAuthors', label: 'Medförfattare', before: 'Inga', after: 'sara' },
				{ field: 'atmosphere', label: 'Atmosfär', before: '1', after: '5' },
				{ field: 'image', label: 'Bild', before: 'old.jpg', after: 'new.jpg' }
			])
		});
	});

	it('buildReviewChangeLog records primary author changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview({ author: 'a' }),
			{
				...buildValidPersistenceFields(),
				author: 'c'
			},
			new Date('2026-01-03T00:00:00Z'),
			'c'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'c',
			changes: expect.arrayContaining([
				{ field: 'author', label: 'Författare', before: 'a', after: 'c' }
			])
		});
	});

	it('buildReviewChangeLog records beer price and happy hour changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview({ beerPriceKr: 79, isHappyHourPrice: false }),
			buildValidPersistenceFields({ 'beer-price': '89', 'happy-hour-price': 'on' }),
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'editor',
			changes: expect.arrayContaining([
				{
					field: 'beerPriceKr',
					label: 'Pris för en stor stark',
					before: '79 kr',
					after: '89 kr'
				},
				{
					field: 'isHappyHourPrice',
					label: 'Happy hour',
					before: 'Nej',
					after: 'Ja'
				}
			])
		});
	});

	it('isDuplicateSlugError identifies mongodb duplicate key errors', () => {
		expect(isDuplicateSlugError({ code: 11000 })).toBe(true);
		expect(isDuplicateSlugError({ code: 12345 })).toBe(false);
		expect(isDuplicateSlugError(null)).toBe(false);
	});
});
