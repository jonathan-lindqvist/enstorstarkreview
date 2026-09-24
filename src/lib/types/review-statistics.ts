export interface ReviewStatisticBar {
	title: string;
	slug: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
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
}
