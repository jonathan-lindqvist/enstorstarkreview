import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { createRouterClient } from '@orpc/server';
import { getRequestIp } from '$lib/server/request';
import type { RpcContext } from './context';
import { isProcedureError } from './errors';
import { router } from './router';

/**
 * The web door: page loads and form actions call the same procedures as the API, server-side
 * and without HTTP, as the signed-in cookie user. Hooks have already authenticated the cookie.
 */
export const webContext = (event: Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>) =>
	({
		user: event.locals.user,
		session: event.locals.session,
		ip: getRequestIp(event as RequestEvent),
		channel: 'web',
		deps: event.locals.deps
	}) satisfies RpcContext;

/** A typed client of every procedure for one web request: `webClient(event).reviews.delete(…)`. */
export const webClient = (event: Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>) =>
	createRouterClient(router, { context: webContext(event) });

/**
 * URL query values as the API door decodes them: a repeated key becomes an array, which a
 * procedure's schema rejects where only one value is allowed. The schema validates the values.
 */
export const webQuery = <T>(url: URL): T => {
	const query: Record<string, string | string[]> = {};
	for (const [key, value] of url.searchParams) {
		const existing = query[key];
		query[key] = existing === undefined ? value : [existing, value].flat();
	}
	return query as T;
};

/**
 * Maps a procedure error to the action failure that the page shows: its status and Swedish
 * message, plus the field pointer and submitted values of a rejected form. With `form`, a
 * failure without its own pointer still gets the whole-form pointer `/`, as review forms expect.
 * Unexpected errors are rethrown, so SvelteKit renders its error page.
 */
export const webFailure = (cause: unknown, options: { form?: boolean } = {}) => {
	if (!isProcedureError(cause)) throw cause;
	const form = cause.data?.form;
	return fail(form?.status ?? cause.status, {
		message: cause.message,
		...(form || options.form ? { pointer: form?.pointer ?? '/' } : {}),
		...form?.values
	});
};

/** For page loads: a procedure error becomes SvelteKit's error page with its status. */
export const webError = (cause: unknown): never => {
	if (!isProcedureError(cause)) throw cause;
	error(cause.status, cause.message);
};
