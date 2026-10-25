import { Layer, ManagedRuntime } from 'effect';
import { env } from '$env/dynamic/private';
import { makeAppLayer } from './layers';

/**
 * The one application runtime. Web loads and actions run on it (`server/web.ts`), and the API
 * handler (`server/api/server.ts`) builds its layer with the same memo map, so both doors share
 * one MongoDB client, one set of caches and one geocoding slot.
 */
export const memoMap = Layer.makeMemoMapUnsafe();

export const AppLayer = makeAppLayer(env);

export const appRuntime = ManagedRuntime.make(AppLayer, { memoMap });
