export const STATISTICS_REGIONS = [
	{ value: 'goteborg', label: 'Göteborg' },
	{ value: 'sverige', label: 'Sverige' },
	{ value: 'varlden', label: 'Världen' }
] as const;

export type StatisticsRegion = (typeof STATISTICS_REGIONS)[number]['value'];

export const parseStatisticsRegion = (values: string[]): StatisticsRegion | null =>
	values.length === 1
		? (STATISTICS_REGIONS.find(({ value }) => value === values[0])?.value ?? null)
		: null;
