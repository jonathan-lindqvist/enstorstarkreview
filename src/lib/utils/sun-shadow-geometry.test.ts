import { describe, expect, it } from 'vitest';
import type { ShadowBuilding, ShadowJob, ShadowMultiPolygon } from '$lib/types/sun-shadows';
import { calculateSunShadows, projectBuildingShadows } from './sun-shadow-geometry';

const meters = (value: number) => ((value / 6378137) * 180) / Math.PI;
const building = (height = 10): ShadowBuilding => ({
	height,
	minHeight: 0,
	polygons: [
		[
			[
				[0, 0],
				[meters(10), 0],
				[meters(10), meters(10)],
				[0, meters(10)],
				[0, 0]
			]
		]
	]
});
const extent = (polygons: ShadowMultiPolygon, axis: number) => {
	const values = polygons.flat(2).map((point) => point[axis] / meters(1));
	return [Math.min(...values), Math.max(...values)];
};
const job: ShadowJob = {
	id: 3,
	timestamp: Date.parse('2026-06-21T10:00:00Z'),
	latitude: 57.72,
	longitude: 12.03,
	bounds: [11.9, 57.6, 12.2, 57.8],
	buildings: [building()],
	partial: false
};

describe('projected building shadows', () => {
	it('casts a ten-meter shadow north from a ten-meter building under a 45-degree southern sun', () => {
		const result = projectBuildingShadows([building()], 45, 180, 0);
		expect(extent(result, 0)[0]).toBeCloseTo(0);
		expect(extent(result, 0)[1]).toBeCloseTo(10);
		expect(extent(result, 1)[1]).toBeCloseTo(20);
	});
	it('casts shadows away from east and west sunlight, with latitude-corrected meters', () => {
		expect(extent(projectBuildingShadows([building()], 45, 90, 0), 0)[0]).toBeCloseTo(-10);
		expect(extent(projectBuildingShadows([building()], 45, 270, 0), 0)[1]).toBeCloseTo(20);
		expect(extent(projectBuildingShadows([building()], 45, 90, 60), 0)[0]).toBeCloseTo(-20);
	});
	it('unions overlapping and split footprints without darker duplicate geometry', () => {
		const one = building();
		expect(projectBuildingShadows([one, one], 45, 180, 0)).toEqual(
			projectBuildingShadows([one], 45, 180, 0)
		);
	});
	it('preserves a courtyard when the sun is overhead', () => {
		const courtyard = building();
		courtyard.polygons[0].push([
			[meters(2), meters(2)],
			[meters(8), meters(2)],
			[meters(8), meters(8)],
			[meters(2), meters(8)],
			[meters(2), meters(2)]
		]);
		const result = projectBuildingShadows([courtyard], 90, 180, 0);
		expect(result[0]).toHaveLength(2);
	});
	it('honours the minimum height of a raised building', () => {
		const raised = { ...building(), minHeight: 5 };
		expect(extent(projectBuildingShadows([raised], 45, 90, 0), 0)[1]).toBeCloseTo(5);
	});
	it('keeps overlapping raised building volumes stable as the selected time changes', () => {
		const polygons: ShadowMultiPolygon = [
			[
				[
					[11.972667574882507, 57.712254696596915],
					[11.972275972366333, 57.71211142033914],
					[11.972249150276184, 57.71211715140035],
					[11.97210431098938, 57.712231772433796],
					[11.97211503982544, 57.71224323451719],
					[11.97259783744812, 57.712415165332516],
					[11.97261929512024, 57.712412299825615],
					[11.972758769989014, 57.7122976793637],
					[11.972753405570984, 57.71228335178046],
					[11.972667574882507, 57.712254696596915]
				]
			]
		];
		for (const minutes of [0, 5, 60, 180]) {
			const result = calculateSunShadows({
				...job,
				timestamp: Date.parse('2026-06-21T08:15:00Z') + minutes * 60_000,
				latitude: 57.7089000000006,
				longitude: 11.974599999997395,
				bounds: [11.97, 57.7, 11.98, 57.72],
				buildings: [
					{ polygons, height: 37, minHeight: 29 },
					{ polygons, height: 44, minHeight: 36 }
				]
			});
			expect(result.status).toBe('ready');
			expect(result.data.features).toHaveLength(1);
		}
	});
	it('clips visible shadow geometry at the viewport edges', () => {
		const result = calculateSunShadows({
			...job,
			latitude: 0,
			longitude: 0,
			bounds: [0, 0, meters(5), meters(5)]
		});
		expect(result.status).toBe('ready');
		expect(result.data.features).toHaveLength(1);
		const coordinates = result.data.features[0].geometry.coordinates;
		for (const axis of [0, 1]) {
			expect(extent(coordinates, axis)[0]).toBeCloseTo(0);
			expect(extent(coordinates, axis)[1]).toBeCloseTo(5);
		}
	});
	it('returns night, low-sun, unavailable and partial states rather than inventing sunlight', () => {
		expect(
			calculateSunShadows({ ...job, timestamp: Date.parse('2026-12-21T00:00:00Z') }).status
		).toBe('night');
		expect(
			calculateSunShadows({ ...job, timestamp: Date.parse('2026-06-21T02:30:00Z') }).status
		).toBe('low-sun');
		expect(calculateSunShadows({ ...job, buildings: [] }).status).toBe('unavailable');
		expect(calculateSunShadows({ ...job, partial: true }).status).toBe('partial');
		expect(calculateSunShadows({ ...job, timestamp: NaN }).status).toBe('unavailable');
	});
	it('clips generated shadows to the viewport and bounds malformed worker jobs', () => {
		const result = calculateSunShadows(job);
		expect(result.id).toBe(3);
		expect(result.status).toBe('ready');
		expect(result.data.features).toEqual([]);
		expect(calculateSunShadows({ ...job, latitude: 91 }).status).toBe('unavailable');
		expect(calculateSunShadows({ ...job, buildings: Array(5001).fill(building()) }).status).toBe(
			'limit'
		);
	});
});
