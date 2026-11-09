import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import type { ShadowJob, ShadowResult, ShadowWorkerMessage } from '$lib/types/sun-shadows';
import { createSunShadowController, type ShadowWorkerPort } from './sun-shadows';

vi.mock('./sun-shadows.worker?worker', () => ({ default: vi.fn() }));

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function setup() {
	const events = new globalThis.Map<string, Set<(event?: unknown) => void>>();
	const sources = new globalThis.Map<string, { setData: ReturnType<typeof vi.fn> }>();
	const layers = new Set<string>();
	let loaded = true;
	let sourceLoaded = true;
	let zoom = 16;
	const feature = {
		properties: { render_height: 10 },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[12, 57],
					[12.01, 57],
					[12.01, 57.01],
					[12, 57]
				]
			]
		}
	};
	const map = {
		on: vi.fn((name, listener) => {
			if (!events.has(name)) events.set(name, new Set());
			events.get(name)!.add(listener);
		}),
		off: vi.fn((name, listener) => events.get(name)?.delete(listener)),
		getZoom: () => zoom,
		isStyleLoaded: () => loaded,
		isSourceLoaded: () => sourceLoaded,
		getSource: (id: string) => sources.get(id),
		getLayer: (id: string) => layers.has(id),
		getStyle: vi.fn(() => ({
			sources: { openmaptiles: { type: 'vector' } },
			layers: [
				{ id: 'building', source: 'openmaptiles', 'source-layer': 'building', type: 'fill' },
				{ id: 'labels', type: 'symbol' }
			]
		})),
		querySourceFeatures: vi.fn(() => [feature]),
		addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
		addLayer: vi.fn((layer) => layers.add(layer.id)),
		setPaintProperty: vi.fn(),
		removeLayer: vi.fn((id: string) => layers.delete(id)),
		removeSource: vi.fn((id: string) => sources.delete(id)),
		getBounds: () => ({
			getWest: () => 11.9,
			getSouth: () => 57.6,
			getEast: () => 12.2,
			getNorth: () => 57.8
		}),
		getCenter: () => ({ lat: 57.72, lng: 12.03 })
	};
	const workers: (ShadowWorkerPort & {
		postMessage: ReturnType<typeof vi.fn>;
		terminate: ReturnType<typeof vi.fn>;
	})[] = [];
	const createWorker = vi.fn(() => {
		const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
		workers.push(worker);
		return worker;
	});
	const onStatus = vi.fn();
	const controller = createSunShadowController(
		map as unknown as Map,
		onStatus,
		createWorker,
		() => 'rgb(0, 0, 0)'
	);
	const update = (enabled = true, timestamp = 1234) => controller.update({ enabled, timestamp });
	const emit = (name: string, event?: unknown) =>
		events.get(name)?.forEach((listener) => listener(event));
	function reply(index = 0) {
		const worker = workers[index];
		const job = worker.postMessage.mock.lastCall![0] as ShadowJob;
		worker.onmessage?.(
			new MessageEvent<ShadowResult>('message', {
				data: { id: job.id, status: 'ready', data: { type: 'FeatureCollection', features: [] } }
			})
		);
	}
	return {
		map,
		workers,
		controller,
		createWorker,
		onStatus,
		update,
		emit,
		reply,
		setLoaded: (value: boolean) => {
			loaded = value;
		},
		setSourceLoaded: (value: boolean) => {
			sourceLoaded = value;
		},
		setZoom: (value: number) => {
			zoom = value;
		}
	};
}

describe('sun shadow worker lifecycle and bounded map work', () => {
	it('starts a shadow frame while the time slider is still moving', async () => {
		const state = setup();
		for (let step = 0; step < 6; step++) {
			state.update(true, 1000 + step);
			await vi.advanceTimersByTimeAsync(40);
		}
		expect(state.createWorker).toHaveBeenCalledOnce();
		expect(state.workers[0].postMessage).toHaveBeenCalledOnce();
		state.controller.destroy();
	});
	it('recalculates during a map drag without clearing the visible shadows', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		state.reply();
		const source = state.map.getSource('review-sun-shadows')!;
		source.setData.mockClear();
		state.map.querySourceFeatures.mockClear();
		for (let step = 0; step < 6; step++) {
			state.emit('move');
			await vi.advanceTimersByTimeAsync(40);
		}
		expect(state.map.querySourceFeatures).toHaveBeenCalled();
		expect(source.setData).not.toHaveBeenCalled();
		state.controller.destroy();
	});
	it('does no worker work while off or zoomed out and never changes the camera', async () => {
		const state = setup();
		state.update(false);
		state.emit('moveend');
		await vi.advanceTimersByTimeAsync(200);
		expect(state.createWorker).not.toHaveBeenCalled();
		state.setZoom(14);
		state.update();
		await vi.advanceTimersByTimeAsync(200);
		expect(state.onStatus).toHaveBeenLastCalledWith('zoom');
		expect(state.map.querySourceFeatures).not.toHaveBeenCalled();
		state.controller.destroy();
	});
	it('reuses one worker and keeps only the latest pending time without starving visible frames', async () => {
		const state = setup();
		state.update();
		state.update(true, 2345);
		await vi.advanceTimersByTimeAsync(150);
		expect(state.workers).toHaveLength(1);
		expect(state.workers[0].postMessage.mock.lastCall![0].timestamp).toBe(2345);
		const oldReply = state.workers[0].onmessage;
		const oldJob = state.workers[0].postMessage.mock.calls[0][0];
		state.update(true, 3456);
		state.update(true, 4567);
		expect(state.workers[0].terminate).not.toHaveBeenCalled();
		expect(state.workers[0].postMessage).toHaveBeenCalledOnce();
		state.reply();
		expect(state.map.addLayer).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(150);
		expect(state.workers).toHaveLength(1);
		expect(state.workers[0].postMessage).toHaveBeenCalledTimes(2);
		expect(state.workers[0].postMessage.mock.lastCall![0].timestamp).toBe(4567);
		const source = state.map.getSource('review-sun-shadows')!;
		source.setData.mockClear();
		oldReply?.(
			new MessageEvent<ShadowResult>('message', {
				data: { id: oldJob.id, status: 'ready', data: { type: 'FeatureCollection', features: [] } }
			})
		);
		expect(source.setData).not.toHaveBeenCalled();
		state.reply();
		expect(state.onStatus).toHaveBeenLastCalledWith('ready');
		expect(source.setData).toHaveBeenCalledOnce();
		state.emit('sourcedata', { sourceId: 'review-sun-shadows', isSourceLoaded: true });
		state.emit('sourcedata', { sourceId: 'unrelated-source', isSourceLoaded: true });
		await vi.advanceTimersByTimeAsync(200);
		expect(state.workers[0].postMessage).toHaveBeenCalledTimes(2);
		state.controller.destroy();
	});
	it('terminates a timed-out worker and ignores its late answer', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		const id = state.workers[0].postMessage.mock.calls[0][0].id;
		state.workers[0].onmessage?.(
			new MessageEvent<ShadowWorkerMessage>('message', { data: { id, type: 'started' } })
		);
		for (let step = 0; step < 20; step++) {
			state.update(true, step);
			await vi.advanceTimersByTimeAsync(100);
		}
		expect(state.onStatus).toHaveBeenLastCalledWith('unavailable');
		expect(state.workers[0].terminate).toHaveBeenCalledOnce();
		state.reply();
		expect(state.map.addLayer).not.toHaveBeenCalled();
		state.controller.destroy();
	});
	it('also bounds worker startup and stops hidden-page work', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(10_150);
		expect(state.onStatus).toHaveBeenLastCalledWith('unavailable');
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		Object.assign(document, { hidden: true });
		document.dispatchEvent(new Event('visibilitychange'));
		expect(state.workers[1].terminate).toHaveBeenCalledOnce();
		Object.assign(document, { hidden: false });
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(150);
		expect(state.workers).toHaveLength(3);
		state.controller.destroy();
	});
	it('does not charge cold worker download time to the calculation budget', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(3150);
		expect(state.onStatus).toHaveBeenLastCalledWith('loading');
		expect(state.workers[0].terminate).not.toHaveBeenCalled();
		state.reply();
		expect(state.onStatus).toHaveBeenLastCalledWith('ready');
		state.controller.destroy();
	});
	it('does not send over-quota tile geometry to the worker', async () => {
		const state = setup();
		const feature = state.map.querySourceFeatures()[0];
		state.map.querySourceFeatures.mockReturnValue(Array(5001).fill(feature));
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		expect(state.onStatus).toHaveBeenLastCalledWith('limit');
		expect(state.createWorker).not.toHaveBeenCalled();
		state.controller.destroy();
	});
	it('waits for a new style and does not publish stale geometry during a style swap', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		state.setLoaded(false);
		state.emit('styledataloading');
		state.emit('move');
		state.reply();
		expect(state.map.addLayer).not.toHaveBeenCalled();
		state.setLoaded(true);
		state.emit('style.load');
		await vi.advanceTimersByTimeAsync(150);
		state.reply(1);
		expect(state.map.addLayer).toHaveBeenCalledOnce();
		state.controller.destroy();
	});
	it('uses loaded building fragments during movement while more tiles are loading', async () => {
		const state = setup();
		state.setLoaded(false);
		state.setSourceLoaded(false);
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		expect(state.workers[0].postMessage.mock.lastCall![0].partial).toBe(true);
		state.reply();
		state.emit('sourcedata', {
			sourceId: 'openmaptiles',
			isSourceLoaded: false,
			sourceDataType: 'content'
		});
		await vi.advanceTimersByTimeAsync(150);
		expect(state.workers[0].postMessage).toHaveBeenCalledTimes(2);
		state.controller.destroy();
	});
	it('waits for building tiles without posting an empty job and clears shadows on zoom-out', async () => {
		const state = setup();
		state.setSourceLoaded(false);
		state.map.querySourceFeatures.mockReturnValue([]);
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		expect(state.createWorker).not.toHaveBeenCalled();
		state.setSourceLoaded(true);
		state.emit('sourcedata', { sourceId: 'openmaptiles', isSourceLoaded: true });
		await vi.advanceTimersByTimeAsync(150);
		state.reply();
		const source = state.map.getSource('review-sun-shadows')!;
		source.setData.mockClear();
		state.emit('move');
		await vi.advanceTimersByTimeAsync(150);
		state.setZoom(14);
		state.emit('move');
		expect(state.onStatus).toHaveBeenLastCalledWith('zoom');
		expect(source.setData).toHaveBeenCalledExactlyOnceWith({
			type: 'FeatureCollection',
			features: []
		});
		expect(state.workers[0].terminate).toHaveBeenCalledOnce();
		state.reply();
		expect(state.onStatus).toHaveBeenLastCalledWith('zoom');
		state.controller.destroy();
	});
	it('handles worker failure and disables work, listeners and layers on teardown', async () => {
		const state = setup();
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		state.workers[0].onerror?.({} as ErrorEvent);
		expect(state.onStatus).toHaveBeenLastCalledWith('unavailable');
		state.update();
		await vi.advanceTimersByTimeAsync(150);
		state.reply(1);
		state.update(false);
		expect(state.map.removeLayer).toHaveBeenCalledOnce();
		state.controller.destroy();
		state.controller.destroy();
		state.update();
		state.emit('moveend');
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(3000);
		expect(state.workers).toHaveLength(2);
		expect(state.map.off).toHaveBeenCalledTimes(5);
	});
});
