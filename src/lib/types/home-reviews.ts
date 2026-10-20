import type { SerializedBarReview } from './bar-review';
import type { Coordinates } from './review-location';
import type { BarAttributeKey } from './bar-attributes';
import type { HomeReviewSort } from './home-review-sort';

export type HomeReviewCard = Pick<
	SerializedBarReview,
	| '_id'
	| 'title'
	| 'slug'
	| 'description'
	| 'location'
	| 'rating'
	| 'image'
	| 'imageFocusX'
	| 'imageFocusY'
	| 'beerBrand'
	| 'beerPriceKr'
	| 'isHappyHourPrice'
	| 'attributes'
	| 'publicationStatus'
	| 'createdAt'
>;

export interface HomeReviewQuery {
	search: string;
	sort: HomeReviewSort;
	attributes: BarAttributeKey[];
	page: number;
}

export interface HomeReviewPage {
	bars: HomeReviewCard[];
	coordinatesByReviewId: Record<string, Coordinates>;
	page: number;
	nextPage: number | null;
}

export interface HomeReviewIndexEntry {
	id: string;
	createdAt: string;
	coordinates: Coordinates | null;
}
