import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import { buildReviewFormData } from '$lib/server/reviews/form';
import { buildReviewPersistenceFields } from '$lib/server/review-form';
import type { BarReview } from '$lib/types/bar-review';
import { ObjectId } from 'mongodb';

export const createValidReviewForm = (overrides: Record<string, string> = {}): FormData => {
	const data = new FormData();
	data.set('authors', 'current');
	data.set('bar-name', overrides['bar-name'] ?? 'Focus Bar');
	data.set('description', overrides.description ?? 'Description');
	data.set('address', overrides.address ?? 'Address');
	data.set('slug', overrides.slug ?? 'focus-bar');
	data.set('beer-brand', overrides['beer-brand'] ?? 'Falcon Export');
	if (overrides['custom-beer-brand'] !== undefined) {
		data.set('custom-beer-brand', overrides['custom-beer-brand']);
	}
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

export const createExistingReview = (overrides: Partial<BarReview> = {}): BarReview => ({
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
	beerBrand: 'Falcon Export',
	beerPriceKr: 79,
	isHappyHourPrice: false,
	author: 'current',
	coAuthors: [],
	changeLog: [],
	createdAt: new Date('2026-01-01T00:00:00Z'),
	updatedAt: new Date('2026-01-02T00:00:00Z'),
	...overrides
});

export const buildValidPersistenceFields = (overrides: Record<string, string> = {}) =>
	buildReviewPersistenceFields(buildReviewFormData(createValidReviewForm(overrides)), 'current');
