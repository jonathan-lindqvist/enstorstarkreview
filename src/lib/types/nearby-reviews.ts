import type { Coordinates } from './review-location';

export interface NearbyReview {
	id: string;
	title: string;
	slug: string;
	coordinates: Coordinates | null;
}

export interface NearbyReviewComparison {
	reviews: NearbyReview[];
	coordinatesByAddress: Record<string, Coordinates>;
	available: boolean;
}

export interface NearbyReviewSummary {
	counts: number[];
	nearest: Array<NearbyReview & { distanceKm: number }>;
	locatedCount: number;
	totalCount: number;
}
