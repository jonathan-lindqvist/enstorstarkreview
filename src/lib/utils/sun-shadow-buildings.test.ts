import { describe, expect, it } from 'vitest';
import {
	MAX_SHADOW_BUILDINGS,
	MAX_SHADOW_VERTICES,
	readShadowBuildings
} from './sun-shadow-buildings';

const ring = [
	[12, 57],
	[12.01, 57],
	[12.01, 57.01],
	[12, 57]
];
const feature = (height: unknown = 12, coordinates: unknown = [ring]) => ({
	properties: { render_height: height, render_min_height: 2 },
	geometry: { type: 'Polygon', coordinates }
});

describe('building tile admission for sunlight calculations', () => {
	it('keeps valid footprint fragments and both heights without forwarding other properties', () => {
		const result = readShadowBuildings([feature()]);
		expect(result).toEqual({
			buildings: [{ polygons: [[ring]], height: 12, minHeight: 2 }],
			partial: false
		});
	});
	it('retains split fragments and multipolygons with courtyards', () => {
		const polygon = feature();
		const multi = {
			...polygon,
			geometry: { type: 'MultiPolygon', coordinates: [[ring, ring], [ring]] }
		};
		expect(readShadowBuildings([polygon, polygon, multi]).buildings).toHaveLength(3);
		expect(readShadowBuildings([multi]).buildings[0].polygons).toHaveLength(2);
	});
	it.each([undefined, null, -1, 0, Infinity, NaN, '12', 1001])(
		'omits invalid height %j and marks partial data',
		(height) => {
			const invalid = { ...feature(), properties: { render_height: height } };
			expect(readShadowBuildings([feature(), invalid])).toMatchObject({ partial: true });
			expect(readShadowBuildings([invalid]).buildings).toHaveLength(0);
		}
	);
	it('rejects malformed geometry, non-finite coordinates, and invalid raised floors', () => {
		for (const bad of [
			null,
			{},
			feature(12, []),
			feature(12, [
				[
					['x', 57],
					[12, 57],
					[12, 57]
				]
			]),
			feature(12, [
				[
					[12, Infinity],
					[12, 57],
					[12, 57]
				]
			]),
			{ ...feature(), properties: { render_height: 12, render_min_height: 13 } }
		]) {
			expect(readShadowBuildings([bad])).toEqual({ buildings: [], partial: true });
		}
	});
	it('applies fragment and vertex quotas before expensive geometry work', () => {
		expect(() => readShadowBuildings(Array(MAX_SHADOW_BUILDINGS + 1).fill(feature()))).toThrow(
			'limit'
		);
		expect(() =>
			readShadowBuildings([feature(12, [Array(MAX_SHADOW_VERTICES + 1).fill([12, 57])])])
		).toThrow('limit');
		expect(readShadowBuildings(Array(MAX_SHADOW_BUILDINGS).fill(feature())).buildings).toHaveLength(
			MAX_SHADOW_BUILDINGS
		);
	});
});
