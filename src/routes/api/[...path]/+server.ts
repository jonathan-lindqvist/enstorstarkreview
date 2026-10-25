import { Effect } from 'effect';
import type { RequestHandler } from './$types';
import { makeApiHandler } from '$lib/server/api/server';
import { AppConfig } from '$lib/server/platform/config';
import { appRuntime, AppLayer, memoMap } from '$lib/server/platform/runtime';
import { resolveClientIp } from '$lib/server/request';

// Every `/api/*` request lands here and is served by the Effect HttpApi (see
// `server/api/contract/api.ts`). The API shares the web runtime's services through the memo map.
const api = makeApiHandler(AppLayer, { memoMap });

const handle: RequestHandler = async ({ request, getClientAddress }) => {
	const { trustProxy } = await appRuntime.runPromise(AppConfig.use(Effect.succeed));
	return api.handle(request, resolveClientIp(request.headers, trustProxy, getClientAddress));
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const fallback = handle;
