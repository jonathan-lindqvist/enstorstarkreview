export interface ReviewStatisticBar {
	title: string;
	slug: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
}

export interface BeerBrandPrice {
	brand: string;
	averagePriceKr: number;
	reviewCount: number;
	happyHourReviewCount: number;
}

export interface PublicReviewStatistics {
	totalReviews: number;
	gothenburgReviews: number;
	averageRating: number | null;
	priceReviewCount: number;
	averageBeerPrice: number | null;
	happyHourReviewCount: number;
	happyHourPercentage: number | null;
	cheapestBars: ReviewStatisticBar[];
	mostExpensiveBars: ReviewStatisticBar[];
	beerBrandPrices: BeerBrandPrice[];
}
