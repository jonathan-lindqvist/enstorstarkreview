import { REVIEW_RATING_METRICS } from '$lib/review-metadata';

export function calculateOverallRating(values: number[]): number {
	const weighted = REVIEW_RATING_METRICS.reduce(
		(sum, metric, index) => sum + (values[index] ?? 0) * metric.weight,
		0
	);

	if (weighted >= 4.5) return 3;
	if (weighted >= 3.25) return 2;
	if (weighted >= 2) return 1;
	return 0;
}
