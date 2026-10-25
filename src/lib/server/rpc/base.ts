import { ORPCError, os } from '@orpc/server';
import type { AuditEventInput } from '$lib/server/audit';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import type { RpcContext } from './context';
import { InvalidBodyError, problem } from './errors';

/**
 * Procedure metadata read by the API door and the OpenAPI generator.
 * - `auth`: `none` (the result never depends on a session), `optional` (a bearer session may
 *   reveal drafts) or `required` (documented as bearer-only; enforced by `authenticated`).
 * - `cache`: `revalidate` makes the API door add an ETag, vary on Authorization and answer
 *   `If-None-Match` with 304 after the procedure has authorized the read.
 */
export interface RpcMeta {
	auth: 'none' | 'optional' | 'required';
	cache?: 'revalidate';
}

/** Every procedure starts here: the request context, metadata and the detailed input shape. */
export const base = os
	.$context<RpcContext>()
	.$meta<RpcMeta>({ auth: 'optional' })
	.$route({ inputStructure: 'detailed' });

type DeniedAudit = {
	eventType: AuditEventInput['eventType'];
	reason: Record<RpcContext['channel'], string>;
	/** Record the sanitized route slug of the denied attempt. */
	targetSlug?: boolean;
};

const rawSlug = (input: unknown): string | undefined => {
	const slug = (input as { params?: { slug?: unknown } } | undefined)?.params?.slug;
	return typeof slug === 'string' ? (parseRouteSlug(slug) ?? undefined) : undefined;
};

/**
 * Requires a signed-in user before any input is read. Writes audit the denied attempt; reads
 * that merely need a session do not.
 */
export const authenticated = (denied?: DeniedAudit) =>
	base.middleware(async ({ context, next }, input: unknown) => {
		if (!context.user) {
			if (denied) {
				await context.deps.audit({
					eventType: denied.eventType,
					outcome: 'denied',
					ip: context.ip,
					...(denied.targetSlug ? { targetSlug: rawSlug(input) } : {}),
					reason: denied.reason[context.channel]
				});
			}
			throw problem(
				'unauthorized',
				context.channel === 'web' ? 'Du är inte inloggad' : 'Du behöver logga in.'
			);
		}
		return next({ context: { user: context.user } });
	});

/** Records the attempt of an authenticated write, before its input is read. */
export const auditAttempt = (eventType: AuditEventInput['eventType']) =>
	base.middleware(async ({ context, next }) => {
		await context.deps.audit({
			eventType,
			outcome: 'attempt',
			username: context.user?.username ?? null,
			ip: context.ip
		});
		return next();
	});

/**
 * Requires a version (`If-Match` on the API, the displayed version on the web) before the body
 * is read. Whether it is current is checked later against the stored review.
 */
export const versionRequired = (apiDetail: string) =>
	base.middleware(async ({ context, next }, input: unknown) => {
		const headers = (input as { headers?: Record<string, unknown> } | undefined)?.headers;
		const ifMatch = headers?.['if-match'];
		if (typeof ifMatch !== 'string' || !ifMatch.trim()) {
			throw problem(
				'precondition_required',
				context.channel === 'web' ? 'Ladda om sidan och försök igen.' : apiDetail
			);
		}
		return next();
	});

/** Audits unreadable or invalid bodies of anonymous writes, which never reach a workflow. */
export const auditInvalidBody = (event: Pick<AuditEventInput, 'eventType'>) =>
	base.middleware(async ({ context, next }) => {
		try {
			return await next();
		} catch (error) {
			if (error instanceof ORPCError && error.cause instanceof InvalidBodyError) {
				await context.deps.audit({
					...event,
					outcome: 'failure',
					ip: context.ip,
					reason: context.channel === 'api' ? 'invalid_api_body' : 'invalid_form_body',
					...(event.eventType === 'login_attempt' && context.channel === 'api'
						? { details: { channel: 'api' } }
						: {})
				});
			}
			throw error;
		}
	});
