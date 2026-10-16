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

export interface ValueStatisticBar extends ReviewStatisticBar {
	beerVolumeCl: number;
	clPerKr: number;
}

export interface BeerBrandValue {
	brand: string;
	averageClPerKr: number;
	reviewCount: number;
	happyHourReviewCount: number;
}

export interface PublicReviewStatistics {
	totalReviews: number;
	gothenburgReviews: number;
	averageRating: number | null;
	priceReviewCount: number;
	averageBeerPrice: number | null;
	totalReviewerSpendKr: number;
	happyHourReviewCount: number;
	happyHourPercentage: number | null;
	cheapestBars: ReviewStatisticBar[];
	mostExpensiveBars: ReviewStatisticBar[];
	beerBrandPrices: BeerBrandPrice[];
	valueReviewCount: number;
	averageClPerKr: number | null;
	bestValueBars: ValueStatisticBar[];
	worstValueBars: ValueStatisticBar[];
	beerBrandValues: BeerBrandValue[];
}
