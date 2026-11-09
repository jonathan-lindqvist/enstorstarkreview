export type ShadowPoint = [number, number];
export type ShadowPolygon = ShadowPoint[][];
export type ShadowMultiPolygon = ShadowPolygon[];

export type SunShadowStatus =
	| 'off'
	| 'loading'
	| 'ready'
	| 'partial'
	| 'zoom'
	| 'night'
	| 'low-sun'
	| 'unavailable'
	| 'limit';

export interface SunShadowSettings {
	enabled: boolean;
	timestamp: number;
}

export interface ShadowBuilding {
	polygons: ShadowMultiPolygon;
	height: number;
	minHeight: number;
}

export interface ShadowData {
	type: 'FeatureCollection';
	features: {
		type: 'Feature';
		properties: Record<string, never>;
		geometry: { type: 'MultiPolygon'; coordinates: ShadowMultiPolygon };
	}[];
}

export interface ShadowJob {
	id: number;
	timestamp: number;
	latitude: number;
	longitude: number;
	bounds: [number, number, number, number];
	buildings: ShadowBuilding[];
	partial: boolean;
}

export interface ShadowResult {
	id: number;
	status: SunShadowStatus;
	data: ShadowData;
}

export type ShadowWorkerMessage = ShadowResult | { id: number; type: 'started' };
