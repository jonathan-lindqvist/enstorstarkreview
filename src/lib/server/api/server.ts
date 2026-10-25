import { Cause, Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder, HttpApiError } from 'effect/http-api';
import type { AppConfig } from '$lib/server/platform/config';
import type { AppServices } from '$lib/server/platform/layers';
import type { Mongo } from '$lib/server/platform/mongo';
import { RequestContext } from '$lib/server/request';
import { EnStorStarkApi } from './contract/api';
import { ApiHandlersLive } from './handlers';
import { internalErrorProblem, notFoundProblem, problem } from './problem';

/**
 * Turns what the handlers did not render into problem responses: unknown routes are 404,
 * parameters that fail the contract are 400, and defects are logged and become a generic 500.
 */
const renderUnhandled = <E>(cause: Cause.Cause<E>) =>
	Effect.sync(() => {
		const error = Cause.squash(cause);
		if (error && typeof error === 'object' && '_tag' in error && error._tag === 'RouteNotFound') {
			return notFoundProblem();
		}
		if (HttpApiError.HttpApiSchemaError.is(error)) {
			return problem(400, 'bad_request', 'Förfrågan har ogiltiga parametrar.');
		}
		console.error('API request failed:', error);
		return internalErrorProblem();
	});

/** The `/api/v1` HttpApi with its handlers, on top of the application services. */
export const makeApiLayer = <E>(services: Layer.Layer<AppServices | AppConfig | Mongo, E>) =>
	HttpApiBuilder.layer(EnStorStarkApi).pipe(
		Layer.provide(ApiHandlersLive),
		Layer.provide(HttpServer.layerServices),
		Layer.provide(services)
	);

/**
 * A fetch-style handler for SvelteKit. The client IP is resolved by the SvelteKit route and
 * passed per request, because only the adapter knows the socket address.
 */
export const makeApiHandler = <E>(
	services: Layer.Layer<AppServices | AppConfig | Mongo, E>,
	options: { memoMap?: Layer.MemoMap } = {}
) => {
	const { handler, dispose } = HttpRouter.toWebHandler(makeApiLayer(services), {
		disableLogger: true,
		memoMap: options.memoMap,
		middleware: (app) => app.pipe(Effect.catchCause(renderUnhandled))
	});
	return {
		handle: (request: Request, ip: string) =>
			handler(request, Context.make(RequestContext, RequestContext.of({ ip })) as never),
		dispose
	};
};
