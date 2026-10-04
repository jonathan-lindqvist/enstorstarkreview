import { OTHER_BEER_BRAND_VALUE } from '$lib/beer-brands';
import type { BarReviewFormData } from '$lib/types/bar-review';
import type { ReviewPersistenceFields } from '$lib/types/review-form';
import type { ReviewAuthorCredit } from '$lib/utils/authors';
import { buildReviewAuthorship } from './authorship';

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
		formData.beerBrandSelection === OTHER_BEER_BRAND_VALUE
			? formData.customBeerBrand
			: formData.beerBrandSelection,
	beerPriceKr: formData.beerPriceKr,
	isHappyHourPrice: formData.isHappyHourPrice,
	attributes: formData.attributes,
	imageFocusX: formData.imageFocusX,
	imageFocusY: formData.imageFocusY,
	...buildReviewAuthorship(formData.authors, currentUsername, existingReview)
});
