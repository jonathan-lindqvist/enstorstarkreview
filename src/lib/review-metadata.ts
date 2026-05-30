import type { BarReviewFormData, ReviewRatingKey, ReviewRatingValues } from '$lib/types/bar-review';

export interface ReviewRatingMetric {
	key: ReviewRatingKey;
	label: string;
	description: string;
	weight: number;
	fullWidth?: boolean;
}

export const REVIEW_RATING_METRICS = [
	{
		key: 'atmosphere',
		label: 'Atmosfär',
		description: 'Stämning och känsla på platsen',
		weight: 0.18,
		fullWidth: false
	},
	{
		key: 'service',
		label: 'Service',
		description: 'Personalens bemötande och snabbhet',
		weight: 0.14,
		fullWidth: false
	},
	{
		key: 'selection',
		label: 'Utbud',
		description: 'Variation av drycker',
		weight: 0.1,
		fullWidth: false
	},
	{
		key: 'quality',
		label: 'Kvalitet',
		description: 'Kvalitet på dryck',
		weight: 0.18,
		fullWidth: false
	},
	{
		key: 'price',
		label: 'Prisvärdhet',
		description: 'Värde för pengarna',
		weight: 0.07,
		fullWidth: false
	},
	{
		key: 'cleanliness',
		label: 'Renlighet',
		description: 'Hygien och ordning',
		weight: 0.12,
		fullWidth: false
	},
	{
		key: 'soundLevel',
		label: 'Ljudnivå',
		description: 'Ljudnivå (0=högljutt, 5=tyst)',
		weight: 0.03,
		fullWidth: true
	},
	{
		key: 'barhopPotential',
		label: 'Barhoppotential',
		description: 'Hur bra är baren för att hoppa vidare från?',
		weight: 0.18,
		fullWidth: false
	}
] as const satisfies readonly ReviewRatingMetric[];

export const REVIEW_RATING_FIELD_NAMES = REVIEW_RATING_METRICS.map((metric) => metric.key).join(
	', '
);

export const createReviewRatingValues = (value = 0): ReviewRatingValues =>
	Object.fromEntries(
		REVIEW_RATING_METRICS.map((metric) => [metric.key, value])
	) as ReviewRatingValues;

export const getReviewRatingValues = (
	formData: Pick<BarReviewFormData, ReviewRatingKey>
): number[] => REVIEW_RATING_METRICS.map((metric) => formData[metric.key]);
