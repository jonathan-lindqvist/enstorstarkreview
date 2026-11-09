import type { GeoJSONSource, Map, MapSourceDataEvent } from 'maplibre-gl';
import type {
	ShadowFrame,
	ShadowWorkerMessage,
	SunShadowSettings,
	SunShadowStatus
} from '$lib/types/sun-shadows';
import { readShadowBuildings } from '$lib/utils/sun-shadow-buildings';
import ShadowWorker from './sun-shadows.worker?worker';

const SOURCE = 'review-sun-shadows';
const FRAME_INTERVAL = 100;
const empty = () => ({ type: 'FeatureCollection' as const, features: [] });

export interface ShadowWorkerPort {
	postMessage: (job: ShadowFrame) => void;
	terminate: () => void;
	onmessage: ((event: MessageEvent<ShadowWorkerMessage>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

function readShadowColor(map: Map): string {
	const probe = document.createElement('span');
	probe.hidden = true;
	probe.style.color = 'var(--color-map-shadow)';
	map.getContainer().append(probe);
	const color = getComputedStyle(probe).color;
	probe.remove();
	return color;
}

export function createSunShadowController(
	map: Map,
	onStatus: (status: SunShadowStatus) => void,
	createWorker: () => ShadowWorkerPort = () => new ShadowWorker(),
	color: () => string = () => readShadowColor(map)
) {
	let settings: SunShadowSettings = { enabled: false, timestamp: 0 };
	let destroyed = false;
	let worker: ShadowWorkerPort | null = null;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let scheduled: ReturnType<typeof setTimeout> | undefined;
	let sequence = 0;
	let activeJob: number | undefined;
	let pending = false;
	let lastStarted = -Infinity;
	let styleLoading = false;
	let buildingSource: string | undefined;
	let geometry: ReturnType<typeof readShadowBuildings> | undefined;
	let geometryRevision = 0;
	let sentGeometryRevision: number | undefined;

	function cancelJob() {
		clearTimeout(timeout);
		clearTimeout(scheduled);
		scheduled = undefined;
		activeJob = undefined;
		pending = false;
		worker?.terminate();
		worker = null;
		sentGeometryRevision = undefined;
	}

	function clearShadows() {
		(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(empty());
	}

	function removeLayer() {
		if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
		if (map.getSource(SOURCE)) map.removeSource(SOURCE);
	}

	function calculate() {
		scheduled = undefined;
		pending = false;
		if (destroyed || !settings.enabled || document.hidden) return;
		if (styleLoading) return;
		const style = map.getStyle();
		if (!style) return;
		const buildingLayer = style.layers?.find(
			(layer) =>
				('source-layer' in layer && layer['source-layer'] === 'building') ||
				layer.id === 'building' ||
				layer.id === 'building-3d'
		);
		const nextSource =
			buildingLayer && 'source' in buildingLayer && typeof buildingLayer.source === 'string'
				? buildingLayer.source
				: undefined;
		if (buildingSource !== nextSource) geometry = undefined;
		buildingSource = nextSource;
		const source = buildingSource ? style.sources[buildingSource] : undefined;
		if (!buildingSource || !source || !['vector', 'geojson'].includes(source.type)) {
			geometry = undefined;
			clearShadows();
			onStatus('unavailable');
			return;
		}
		try {
			const loaded = map.isSourceLoaded(buildingSource);
			if (!geometry) {
				const features = map.querySourceFeatures(
					buildingSource,
					source.type === 'vector' ? { sourceLayer: 'building' } : undefined
				);
				if (!loaded && features.length === 0) return;
				geometry = readShadowBuildings(features);
				geometryRevision++;
			}
			const instance = worker ?? createWorker();
			worker = instance;
			const id = ++sequence;
			activeJob = id;
			lastStarted = Date.now();
			let started = false;
			function failed() {
				if (worker !== instance) return;
				cancelJob();
				clearShadows();
				onStatus('unavailable');
			}
			instance.onerror = failed;
			instance.onmessage = ({ data }) => {
				if (worker !== instance || activeJob !== id || data.id !== id) return;
				if ('type' in data) {
					if (!started) {
						started = true;
						clearTimeout(timeout);
						timeout = setTimeout(failed, 2_000);
					}
					return;
				}
				clearTimeout(timeout);
				activeJob = undefined;
				try {
					if (!map.getSource(SOURCE)) {
						map.addSource(SOURCE, { type: 'geojson', data: empty() });
					}
					if (!map.getLayer(SOURCE)) {
						const firstLabel = map.getStyle().layers?.find((layer) => layer.type === 'symbol');
						map.addLayer(
							{
								id: SOURCE,
								type: 'fill',
								source: SOURCE,
								paint: {
									'fill-color': color(),
									'fill-opacity': 0.5
								}
							},
							firstLabel?.id
						);
					}
					map.setPaintProperty(SOURCE, 'fill-color', color());
					(map.getSource(SOURCE) as GeoJSONSource).setData(data.data);
					onStatus(data.status);
					if (pending) schedule();
				} catch {
					failed();
				}
			};
			timeout = setTimeout(failed, 10_000);
			const bounds = map.getBounds();
			const center = map.getCenter();
			instance.postMessage({
				id,
				timestamp: settings.timestamp,
				latitude: center.lat,
				longitude: center.lng,
				bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
				geometryRevision,
				...(sentGeometryRevision === geometryRevision ? {} : { buildings: geometry.buildings }),
				partial: geometry.partial || !loaded
			});
			sentGeometryRevision = geometryRevision;
		} catch (error) {
			cancelJob();
			clearShadows();
			onStatus(
				error instanceof Error && error.message === 'shadow limit' ? 'limit' : 'unavailable'
			);
		}
	}

	function schedule() {
		if (destroyed || !settings.enabled || document.hidden || styleLoading) return;
		if (map.getZoom() < 15) {
			cancelJob();
			clearShadows();
			onStatus('zoom');
			return;
		}
		pending = true;
		if (activeJob !== undefined || scheduled !== undefined) return;
		if (!map.getLayer(SOURCE)) onStatus('loading');
		scheduled = setTimeout(calculate, Math.max(0, lastStarted + FRAME_INTERVAL - Date.now()));
	}

	function sourceChanged(event: MapSourceDataEvent) {
		if (
			event.sourceId !== SOURCE &&
			(event.isSourceLoaded || event.sourceDataType === 'content') &&
			(!buildingSource || event.sourceId === buildingSource)
		) {
			geometry = undefined;
			schedule();
		}
	}

	function mapMoved() {
		geometry = undefined;
		schedule();
	}

	function visibilityChanged() {
		if (document.hidden) cancelJob();
		else mapMoved();
	}

	function styleChanged() {
		styleLoading = true;
		buildingSource = undefined;
		geometry = undefined;
		cancelJob();
		clearShadows();
		if (settings.enabled) onStatus('loading');
	}

	function styleLoaded() {
		styleLoading = false;
		geometry = undefined;
		schedule();
	}

	map.on('move', mapMoved);
	map.on('moveend', mapMoved);
	map.on('sourcedata', sourceChanged);
	map.on('style.load', styleLoaded);
	map.on('styledataloading', styleChanged);
	document.addEventListener('visibilitychange', visibilityChanged);
	return {
		update(next: SunShadowSettings) {
			if (destroyed) return;
			settings = next;
			if (next.enabled) schedule();
			else {
				cancelJob();
				geometry = undefined;
				removeLayer();
				onStatus('off');
			}
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			cancelJob();
			geometry = undefined;
			map.off('move', mapMoved);
			map.off('moveend', mapMoved);
			map.off('sourcedata', sourceChanged);
			map.off('style.load', styleLoaded);
			map.off('styledataloading', styleChanged);
			document.removeEventListener('visibilitychange', visibilityChanged);
			removeLayer();
		}
	};
}
