import type {
	ShadowBuilding,
	ShadowFrame,
	ShadowMultiPolygon,
	ShadowPoint,
	ShadowPolygon,
	ShadowResult,
	ShadowJob
} from '$lib/types/sun-shadows';
import ClipperLib from 'clipper-lib';
import { getPosition } from 'suncalc';
import { MAX_SHADOW_BUILDINGS, MAX_SHADOW_VERTICES } from './sun-shadow-buildings';

const RADIUS = 6_378_137;
const RADIANS = Math.PI / 180;
const UNITS_PER_METER = 1_000;

function merge(polygons: ShadowMultiPolygon[], clip?: ShadowPolygon): ShadowMultiPolygon {
	const engine = new ClipperLib.Clipper();
	const paths = polygons.flat(1).flatMap((polygon) =>
		polygon.map((ring, index) => {
			const path = ring.map(([X, Y]) => ({ X, Y }));
			if (ClipperLib.Clipper.Orientation(path) !== (index === 0)) path.reverse();
			return path;
		})
	);
	if (!engine.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)) return [];
	if (clip) {
		engine.AddPaths(
			clip.map((ring) => ring.map(([X, Y]) => ({ X, Y }))),
			ClipperLib.PolyType.ptClip,
			true
		);
	}
	const result = new ClipperLib.PolyTree();
	if (
		!engine.Execute(
			clip ? ClipperLib.ClipType.ctIntersection : ClipperLib.ClipType.ctUnion,
			result,
			ClipperLib.PolyFillType.pftNonZero,
			ClipperLib.PolyFillType.pftNonZero
		)
	)
		throw new Error('shadow geometry');
	return ClipperLib.JS.PolyTreeToExPolygons(result).map(({ outer, holes }) =>
		[outer, ...holes].map((path) => {
			const ring = path.map(({ X, Y }): ShadowPoint => [X, Y]);
			return [...ring, ring[0]];
		})
	);
}

export function projectBuildingShadows(
	buildings: ShadowBuilding[],
	altitude: number,
	azimuth: number,
	latitude: number,
	bounds?: ShadowJob['bounds']
): ShadowMultiPolygon {
	const scale = 1 / (Math.tan(altitude * RADIANS) * Math.cos(latitude * RADIANS));
	const east = -Math.sin(azimuth * RADIANS) * scale * UNITS_PER_METER;
	const north = -Math.cos(azimuth * RADIANS) * scale * UNITS_PER_METER;
	const [originLng, originLat] = buildings[0]?.polygons[0]?.[0]?.[0] ?? [0, 0];
	const originY = RADIUS * Math.log(Math.tan(Math.PI / 4 + (originLat * RADIANS) / 2));
	// Integer millimetres keep shared edges stable throughout union and viewport clipping.
	function project([lng, lat]: ShadowPoint): ShadowPoint {
		return [
			Math.round(RADIUS * (lng - originLng) * RADIANS * UNITS_PER_METER),
			Math.round(
				(RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * RADIANS) / 2)) - originY) * UNITS_PER_METER
			)
		];
	}
	const clip: ShadowPolygon | undefined = bounds
		? [
				[
					project([bounds[0], bounds[1]]),
					project([bounds[2], bounds[1]]),
					project([bounds[2], bounds[3]]),
					project([bounds[0], bounds[3]])
				]
			]
		: undefined;
	const shapes: ShadowMultiPolygon[] = [];
	for (const building of buildings) {
		const lowerOffset: ShadowPoint = [
			Math.round(east * building.minHeight),
			Math.round(north * building.minHeight)
		];
		const upperOffset: ShadowPoint = [
			Math.round(east * building.height),
			Math.round(north * building.height)
		];
		for (const polygon of building.polygons) {
			if (clip) {
				let west = Infinity,
					south = Infinity,
					east = -Infinity,
					north = -Infinity;
				for (const ring of polygon) {
					for (const [lng, lat] of ring) {
						west = Math.min(west, lng);
						south = Math.min(south, lat);
						east = Math.max(east, lng);
						north = Math.max(north, lat);
					}
				}
				const minimum = project([west, south]);
				const maximum = project([east, north]);
				if (
					[0, 1].some(
						(axis) =>
							maximum[axis] + Math.max(lowerOffset[axis], upperOffset[axis]) <
								clip[0][0][axis] - 1 ||
							minimum[axis] + Math.min(lowerOffset[axis], upperOffset[axis]) > clip[0][2][axis] + 1
					)
				)
					continue;
			}
			const ground = polygon.map((ring) => ring.map(project));
			const lower = ground.map((ring) =>
				ring.map(([x, y]): [number, number] => [x + lowerOffset[0], y + lowerOffset[1]])
			);
			const upper = ground.map((ring) =>
				ring.map(([x, y]): [number, number] => [x + upperOffset[0], y + upperOffset[1]])
			);
			shapes.push([lower], [upper]);
			for (let r = 0; r < ground.length; r++) {
				for (let p = 1; p < ground[r].length; p++) {
					shapes.push([
						[[lower[r][p - 1], lower[r][p], upper[r][p], upper[r][p - 1], lower[r][p - 1]]]
					]);
				}
			}
		}
	}
	return merge(shapes, clip).map((polygon) =>
		polygon.map((ring) =>
			ring.map(([x, y]): [number, number] => [
				x / UNITS_PER_METER / RADIUS / RADIANS + originLng,
				(2 * Math.atan(Math.exp((y / UNITS_PER_METER + originY) / RADIUS)) - Math.PI / 2) / RADIANS
			])
		)
	);
}

function geometryWithinLimits(buildings: ShadowBuilding[]): boolean {
	if (buildings.length > MAX_SHADOW_BUILDINGS) return false;
	let vertices = 0;
	for (const building of buildings) {
		for (const polygon of building.polygons) {
			for (const ring of polygon) {
				vertices += ring.length;
				if (vertices > MAX_SHADOW_VERTICES) return false;
			}
		}
	}
	return true;
}

export function createSunShadowCalculator() {
	let geometry: { revision: number; buildings: ShadowBuilding[] } | undefined;
	return (frame: ShadowFrame): ShadowResult => {
		const unavailable: ShadowResult = {
			id: frame.id,
			status: 'unavailable',
			data: { type: 'FeatureCollection', features: [] }
		};
		try {
			if (frame.buildings !== undefined) {
				geometry = undefined;
				if (!geometryWithinLimits(frame.buildings)) return { ...unavailable, status: 'limit' };
				geometry = { revision: frame.geometryRevision, buildings: frame.buildings };
			}
			if (!geometry || geometry.revision !== frame.geometryRevision) {
				geometry = undefined;
				return unavailable;
			}
			return calculateSunShadows({ ...frame, buildings: geometry.buildings });
		} catch {
			geometry = undefined;
			return unavailable;
		}
	};
}

export function calculateSunShadows(job: ShadowJob): ShadowResult {
	const result: ShadowResult = {
		id: job.id,
		status: 'unavailable',
		data: { type: 'FeatureCollection', features: [] }
	};
	try {
		if (
			!Number.isFinite(job.timestamp) ||
			!Number.isFinite(job.latitude) ||
			Math.abs(job.latitude) > 85 ||
			!Number.isFinite(job.longitude) ||
			Math.abs(job.longitude) > 180 ||
			job.bounds.length !== 4 ||
			!job.bounds.every(Number.isFinite) ||
			job.bounds[0] >= job.bounds[2] ||
			job.bounds[1] >= job.bounds[3]
		)
			return result;
		if (!geometryWithinLimits(job.buildings)) return { ...result, status: 'limit' };
		const sun = getPosition(new Date(job.timestamp), job.latitude, job.longitude);
		if (sun.altitude <= 0) return { ...result, status: 'night' };
		if (sun.altitude < 3) return { ...result, status: 'low-sun' };
		if (!job.buildings.length) return result;
		const coordinates = projectBuildingShadows(
			job.buildings,
			sun.altitude,
			sun.azimuth,
			job.latitude,
			job.bounds
		);
		let outputVertices = 0;
		for (const polygon of coordinates) {
			for (const ring of polygon) outputVertices += ring.length;
		}
		if (outputVertices > MAX_SHADOW_VERTICES) return { ...result, status: 'limit' };
		return {
			id: job.id,
			status: job.partial ? 'partial' : 'ready',
			data: {
				type: 'FeatureCollection',
				features: coordinates.length
					? [
							{
								type: 'Feature',
								properties: {},
								geometry: { type: 'MultiPolygon', coordinates }
							}
						]
					: []
			}
		};
	} catch {
		return result;
	}
}
