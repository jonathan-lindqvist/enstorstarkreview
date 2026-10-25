import {
	error,
	fail,
	isHttpError,
	isRedirect,
	type ActionFailure,
	type RequestEvent
} from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import { audit } from '$lib/server/audit';
import { AppConfig } from '$lib/server/platform/config';
import type { AppServices } from '$lib/server/platform/layers';
import type { Mongo } from '$lib/server/platform/mongo';
import { appRuntime } from '$lib/server/platform/runtime';
import { httpStatusOf, messageOf } from '$lib/server/errors';
import { CurrentUser, RequestContext, Viewer, resolveClientIp } from '$lib/server/request';

/** What a web load or action may use: the services plus the per-request context. */
export type WebServices = AppServices | AppConfig | Mongo | RequestContext | Viewer;

type Event = Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>;

const viewerOf = (locals: App.Locals) =>
	locals.user && locals.session
		? Viewer.of({
				user: Option.some({ id: locals.user.id, username: locals.user.username }),
				session: Option.some({ id: locals.session.id, expiresAt: locals.session.expiresAt })
			})
		: Viewer.anonymous;

const withRequest = <A, E, R>(event: Event, effect: Effect.Effect<A, E, R>) =>
	Effect.gen(function* () {
		const { trustProxy } = yield* AppConfig;
		const ip = resolveClientIp(event.request.headers, trustProxy, event.getClientAddress);
		return yield* effect.pipe(
			Effect.provideService(RequestContext, RequestContext.of({ ip })),
			Effect.provideService(Viewer, viewerOf(event.locals))
		);
	});

/**
 * Runs a workflow for a SvelteKit load or action on the shared runtime. A domain error with a
 * client status becomes `error(status, message)`, so a load can simply fail; anything else is
 * rethrown as the 500 it is. SvelteKit's own `redirect()`/`error()` thrown inside pass through.
 */
export const runWeb = async <A, E>(
	event: Event,
	effect: Effect.Effect<A, E, WebServices>
): Promise<A> => {
	const exit = await appRuntime.runPromiseExit(withRequest(event, effect));
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.squash(exit.cause);
	if (isRedirect(failure) || isHttpError(failure)) throw failure;
	const status = httpStatusOf(failure);
	if (status && status < 500) error(status, messageOf(failure) ?? 'Något gick fel');
	throw failure;
};

/**
 * Like `runWeb`, for workflows that need the signed-in user. Routes check `locals.user` first,
 * so they can audit and answer anonymous requests in their own way.
 */
export const runWebAsUser = <A, E>(
	event: Event,
	effect: Effect.Effect<A, E, WebServices | CurrentUser>
): Promise<A> => {
	const { user, session } = event.locals;
	if (!user || !session) throw new Error('runWebAsUser requires a signed-in user');
	return runWeb(
		event,
		Effect.provideService(
			effect,
			CurrentUser,
			CurrentUser.of({
				id: user.id,
				username: user.username,
				session: { id: session.id, expiresAt: session.expiresAt }
			})
		)
	);
};

/** The status a no-JS form answers with. Field validation stays 400, as before the migration. */
export const formStatus = (failure: unknown): number => {
	const status = httpStatusOf(failure) ?? 500;
	return status === 422 ? 400 : status;
};

/**
 * Turns domain errors into `fail()` for form actions, with the Swedish message and any extra
 * fields the page needs to restore the form. Errors without an HTTP status stay failures.
 */
export const failWith =
	<T extends Record<string, unknown>>(extra: (failure: unknown) => T = () => ({}) as T) =>
	<A, E, R>(
		effect: Effect.Effect<A, E, R>
	): Effect.Effect<A | ActionFailure<{ message: string } & T>, never, R> =>
		effect.pipe(
			Effect.catch((failure) =>
				httpStatusOf(failure) === undefined
					? Effect.die(failure)
					: Effect.succeed(
							fail(formStatus(failure), {
								message: messageOf(failure) ?? 'Något gick fel',
								...extra(failure)
							})
						)
			)
		);

/** Audits a protected web request that arrived without a session. */
export const auditDenied = (eventType: string, reason: string, targetSlug?: string | null) =>
	Effect.gen(function* () {
		const { ip } = yield* RequestContext;
		yield* audit({ eventType, outcome: 'denied', ip, targetSlug: targetSlug ?? undefined, reason });
	});
