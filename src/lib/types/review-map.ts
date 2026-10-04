export interface MapReview {
	title: string;
	slug: string;
	rating: number;
	location: string;
	beerPriceKr?: number;
	isHappyHourPrice?: boolean;
}

export interface PublicReviewMapMarker extends MapReview {
	latitude: number;
	longitude: number;
}

export interface PublicReviewMapData {
	markers: PublicReviewMapMarker[];
	totalReviews: number;
}
