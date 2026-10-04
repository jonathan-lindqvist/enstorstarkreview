import type { Filter, FindOptions } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';
import type { MapGeocode } from '$lib/types/map-geocode';
import type { MapReview, PublicReviewMapData } from '$lib/types/review-map';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import { isValidBeerPriceKr } from '$lib/utils/price';
import { normalizeMapAddress, hasValidCoordinates } from './address';

interface MarkerReviewCollection {
	find(filter: Filter<BarReview>, options: FindOptions): { toArray(): Promise<unknown[]> };
}
interface ResolvedGeocodeCollection {
	find(filter: Filter<MapGeocode>): { toArray(): Promise<MapGeocode[]> };
}
export const createMarkerLoader = (
	bars: MarkerReviewCollection,
	mapGeocodes: ResolvedGeocodeCollection
) => {
	const parseMapReview = (value: unknown): MapReview | null => {
		if (!value || typeof value !== 'object') return null;
		const review = value as Partial<MapReview>;
		if (
			typeof review.title !== 'string' ||
			typeof review.slug !== 'string' ||
			typeof review.location !== 'string' ||
			typeof review.rating !== 'number' ||
			!Number.isFinite(review.rating)
		) {
			return null;
		}

		const parsed: MapReview = {
			title: review.title,
			slug: review.slug,
			rating: review.rating,
			location: review.location
		};
		if (isValidBeerPriceKr(review.beerPriceKr)) {
			parsed.beerPriceKr = review.beerPriceKr;
			parsed.isHappyHourPrice = review.isHappyHourPrice === true;
		}
		return parsed;
	};

	const loadPublicMapReviews = async (): Promise<MapReview[]> => {
		const reviews = await bars
			.find(PUBLIC_REVIEW_FILTER, {
				projection: {
					_id: 0,
					title: 1,
					slug: 1,
					rating: 1,
					location: 1,
					beerPriceKr: 1,
					isHappyHourPrice: 1
				},
				sort: { updatedAt: -1, _id: 1 }
			})
			.toArray();

		return reviews
			.flatMap((review) => {
				const parsed = parseMapReview(review);
				return parsed ? [parsed] : [];
			})
			.filter((review) => normalizeMapAddress(review.location).length > 0);
	};

	const loadPublicReviewMapData = async (): Promise<PublicReviewMapData> => {
		const reviews = await loadPublicMapReviews();
		const addressKeys = [...new Set(reviews.map((review) => normalizeMapAddress(review.location)))];
		const geocodes = addressKeys.length
			? await mapGeocodes.find({ addressKey: { $in: addressKeys }, status: 'resolved' }).toArray()
			: [];
		const geocodesByAddress = new Map(geocodes.map((geocode) => [geocode.addressKey, geocode]));

		const markers = reviews.flatMap((review) => {
			const geocode = geocodesByAddress.get(normalizeMapAddress(review.location));
			if (!geocode || !hasValidCoordinates(geocode)) return [];

			return [{ ...review, latitude: geocode.latitude, longitude: geocode.longitude }];
		});

		return { markers, totalReviews: reviews.length };
	};

	return { loadReviews: loadPublicMapReviews, loadMapData: loadPublicReviewMapData };
};
