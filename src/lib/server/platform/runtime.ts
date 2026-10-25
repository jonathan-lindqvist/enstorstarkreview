import { Layer, ManagedRuntime } from 'effect';
import { env } from '$env/dynamic/private';
import type { AppConfig } from './config';
import { makeAppLayer, type AppServices } from './layers';
import type { Mongo } from './mongo';

type Services = AppServices | AppConfig | Mongo;

/**
 * The one application runtime. Web loads and actions run on it (`server/web.ts`), and the API
 * handler (`server/api/server.ts`) builds its layer with the same memo map, so both doors share
 * one MongoDB client, one set of caches and one geocoding slot.
 */
export const memoMap = Layer.makeMemoMapUnsafe();

export const AppLayer = makeAppLayer(env);

let runtime: ManagedRuntime.ManagedRuntime<Services, unknown> = ManagedRuntime.make(AppLayer, {
	memoMap
});

/** The current runtime. Read it per call, so tests can swap it. */
export const appRuntime = {
	runPromise: <A, E>(effect: Parameters<typeof runtime.runPromise<A, E>>[0]) =>
		runtime.runPromise(effect),
	runPromiseExit: <A, E>(effect: Parameters<typeof runtime.runPromiseExit<A, E>>[0]) =>
		runtime.runPromiseExit(effect)
};

/**
 * Test only: runs web routes on the given layer (normally `makeTestAppLayer`) until the returned
 * function restores the production runtime. Each call gets fresh caches.
 */
export const useTestRuntime = (layer: Layer.Layer<Services, unknown>) => {
	const previous = runtime;
	const test = ManagedRuntime.make(layer);
	runtime = test;
	return async () => {
		runtime = previous;
		await test.dispose();
	};
};
