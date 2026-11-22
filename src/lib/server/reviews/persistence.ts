import type { Filter, ObjectId } from 'mongodb';
import { OTHER_BEER_BRAND_VALUE, UNKNOWN_BEER_BRAND_VALUE } from '$lib/beer-brands';
import type { BarReview, BarReviewFormData } from '$lib/types/bar-review';
import type { ReviewPersistenceFields } from '$lib/types/review-form';
import type { ReviewAuthorCredit } from '$lib/utils/authors';
import { buildReviewAuthorship } from './authorship';

/** The unique index reserves a slug even when the review is deleted. */
export const reviewSlugReservationFilter = (
	slug: string,
	excludeId?: ObjectId
): Filter<BarReview> => ({
	slug,
	...(excludeId ? { _id: { $ne: excludeId } } : {})
});

export const buildReviewPersistenceFields = (
	formData: BarReviewFormData,
	currentUsername: string,
	existingReview?: ReviewAuthorCredit
): ReviewPersistenceFields => ({
	title: formData.barName,
	description: formData.description,
	atmosphere: formData.atmosphere,
	service: formData.service,
	selection: formData.selection,
	quality: formData.quality,
	price: formData.price,
	cleanliness: formData.cleanliness,
	soundLevel: formData.soundLevel,
	barhopPotential: formData.barhopPotential,
	rating: formData.rating,
	location: formData.address,
	slug: formData.slug,
	beerBrand:
		formData.beerBrandSelection === UNKNOWN_BEER_BRAND_VALUE
			? null
			: formData.beerBrandSelection === OTHER_BEER_BRAND_VALUE
				? formData.customBeerBrand
				: formData.beerBrandSelection,
	beerPriceKr: formData.beerPriceKr,
	beerVolumeCl: formData.beerVolumeCl,
	isHappyHourPrice: formData.isHappyHourPrice,
	attributes: formData.attributes,
	imageFocusX: formData.imageFocusX,
	imageFocusY: formData.imageFocusY,
	...buildReviewAuthorship(formData.authors, currentUsername, existingReview)
});
