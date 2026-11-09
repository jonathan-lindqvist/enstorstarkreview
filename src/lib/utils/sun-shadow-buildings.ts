import type { ShadowBuilding, ShadowMultiPolygon, ShadowPolygon } from '$lib/types/sun-shadows';

export const MAX_SHADOW_BUILDINGS = 5_000;
export const MAX_SHADOW_VERTICES = 100_000;

export function readShadowBuildings(features: unknown[]): {
	buildings: ShadowBuilding[];
	partial: boolean;
} {
	if (features.length > MAX_SHADOW_BUILDINGS) throw new Error('shadow limit');
	const buildings: ShadowBuilding[] = [];
	let partial = false;
	let vertices = 0;
	for (const feature of features) {
		if (!feature || typeof feature !== 'object') {
			partial = true;
			continue;
		}
		const { properties, geometry } = feature as {
			properties?: Record<string, unknown>;
			geometry?: { type?: unknown; coordinates?: unknown };
		};
		const height = properties?.render_height;
		const minHeight = properties?.render_min_height ?? 0;
		if (
			typeof height !== 'number' ||
			!Number.isFinite(height) ||
			height <= 0 ||
			height > 1_000 ||
			typeof minHeight !== 'number' ||
			!Number.isFinite(minHeight) ||
			minHeight < 0 ||
			minHeight >= height ||
			!geometry ||
			!['Polygon', 'MultiPolygon'].includes(String(geometry.type))
		) {
			partial = true;
			continue;
		}
		const raw = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
		const polygons: ShadowMultiPolygon = [];
		let valid = Array.isArray(raw) && raw.length > 0;
		if (Array.isArray(raw)) {
			for (const polygon of raw) {
				if (!Array.isArray(polygon) || !polygon.length) {
					valid = false;
					break;
				}
				const rings: ShadowPolygon = [];
				for (const ring of polygon) {
					if (!Array.isArray(ring) || ring.length < 4) {
						valid = false;
						break;
					}
					vertices += ring.length;
					if (vertices > MAX_SHADOW_VERTICES) throw new Error('shadow limit');
					const points: ShadowPolygon[number] = [];
					for (const point of ring) {
						if (
							!Array.isArray(point) ||
							point.length < 2 ||
							typeof point[0] !== 'number' ||
							!Number.isFinite(point[0]) ||
							Math.abs(point[0]) > 180 ||
							typeof point[1] !== 'number' ||
							!Number.isFinite(point[1]) ||
							Math.abs(point[1]) > 85
						) {
							valid = false;
							break;
						}
						points.push([point[0], point[1]]);
					}
					if (!valid) break;
					const first = points[0];
					const last = points.at(-1)!;
					if (first[0] !== last[0] || first[1] !== last[1]) {
						valid = false;
						break;
					}
					rings.push(points);
				}
				if (!valid) break;
				polygons.push(rings);
			}
		}
		if (valid) buildings.push({ polygons, height, minHeight });
		else partial = true;
	}
	return { buildings, partial };
}
