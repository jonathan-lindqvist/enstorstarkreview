export interface PriceComparisonPoint {
	title: string;
	slug: string;
	beerPriceKr: number;
	isHappyHourPrice: boolean;
	// The review's "Prisvärdhet" aspect (0–5); null when a legacy review lacks it.
	valueRating: number | null;
}
