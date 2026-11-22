import ClipperLib from 'clipper-lib';
import type { Coordinates } from '$lib/types/review-location';
import type { StatisticsRegion } from '$lib/statistics-regions';
import boundaryData from './data/statistics-boundaries.geojson?raw';

type GeographicRegion = Exclude<StatisticsRegion, 'varlden'>;
type Position = [longitude: number, latitude: number];
type Polygon = Position[][];

const toIntPoint = (longitude: number, latitude: number): ClipperLib.IntPoint => ({
	X: Math.round(longitude * 1_000_000),
	Y: Math.round(latitude * 1_000_000)
});

const { features } = JSON.parse(boundaryData) as {
	features: Array<{ id: GeographicRegion; geometry: { coordinates: Polygon[] } }>;
};
const boundaries = Object.fromEntries(
	features.map(({ id, geometry }) => [
		id,
		geometry.coordinates.map((polygon) =>
			polygon.map((ring) =>
				ring.slice(0, -1).map(([longitude, latitude]) => toIntPoint(longitude, latitude))
			)
		)
	])
) as Record<GeographicRegion, ClipperLib.Paths[]>;

const containsPosition = (region: GeographicRegion, point: ClipperLib.IntPoint): boolean => {
	const { PointInPolygon } = ClipperLib.Clipper;
	return boundaries[region].some(
		([exterior, ...holes]) =>
			PointInPolygon(point, exterior) !== 0 &&
			holes.every((hole) => PointInPolygon(point, hole) !== 1)
	);
};

export const classifyStatisticsRegion = ({
	longitude,
	latitude
}: Coordinates): StatisticsRegion => {
	const point = toIntPoint(longitude, latitude);
	if (containsPosition('goteborg', point)) return 'goteborg';
	return containsPosition('sverige', point) ? 'sverige' : 'varlden';
};
