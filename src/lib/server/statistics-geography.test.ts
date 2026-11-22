import { expect, it } from 'vitest';
import { classifyStatisticsRegion } from './statistics-geography';

it.each([
	['Göteborg', 57.7089, 11.9746, 'goteborg'],
	['Kungsbacka', 57.4875, 12.0764, 'goteborg'],
	['Stockholm', 59.3293, 18.0686, 'sverige'],
	['Tallinn', 59.437, 24.7536, 'varlden']
] as const)('classifies a saved pin in %s', (_city, latitude, longitude, region) => {
	expect(classifyStatisticsRegion({ latitude, longitude })).toBe(region);
});
