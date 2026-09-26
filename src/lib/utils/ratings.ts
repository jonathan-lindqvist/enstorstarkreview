import { REVIEW_RATING_METRICS } from '$lib/review-metadata';

export const OVERALL_RATING_MIN = 0;
export const OVERALL_RATING_MAX = 3;

// Highest threshold first. A weighted score below every threshold gives OVERALL_RATING_MIN.
// Native clients receive these values from /api/v1/review-metadata.
export const OVERALL_RATING_THRESHOLDS = [
	{ minimumWeightedScore: 4.5, rating: 3 },
	{ minimumWeightedScore: 3.25, rating: 2 },
	{ minimumWeightedScore: 2, rating: 1 }
] as const;

export function calculateOverallRating(values: number[]): number {
	const weighted = REVIEW_RATING_METRICS.reduce(
		(sum, metric, index) => sum + (values[index] ?? 0) * metric.weight,
		0
	);

	return (
		OVERALL_RATING_THRESHOLDS.find((threshold) => weighted >= threshold.minimumWeightedScore)
			?.rating ?? OVERALL_RATING_MIN
	);
}
