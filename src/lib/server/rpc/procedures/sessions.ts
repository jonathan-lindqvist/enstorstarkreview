import { z } from 'zod';
import {
	admitLoginIp,
	loginWithPassword,
	type LoginIpAdmission,
	type LoginResult
} from '$lib/server/login/login';
import { auditInvalidBody, authenticated, base } from '../base';
import { problem, problems } from '../errors';
import { apiInput, jsonBody } from '../input';
import { problemResponse, unvalidated, withResponses } from '../schema-docs';
import { Session, SessionCreated, SessionCreateRequest } from '../schemas';

const loginProblem = (result: Extract<LoginResult<never>, { ok: false }>) =>
	result.kind === 'rate_limited'
		? problem('rate_limited', result.message, {
				headers: { 'retry-after': String(result.retryAfterSeconds) }
			})
		: problem('invalid_credentials', result.message);

/**
 * The API consumes the login IP quota before any body is read, including malformed ones. The web
 * door's small form is already parsed, and the workflow admits it in the existing order.
 */
const admitLogin = base.middleware(async ({ context, next }) => {
	let loginAdmission: LoginIpAdmission | undefined;
	if (context.channel === 'api') {
		const admission = await admitLoginIp({ ip: context.ip, channel: 'api' }, context.deps.login);
		if (!admission.ok) throw loginProblem(admission);
		loginAdmission = admission;
	}
	return next({ context: { loginAdmission } });
});

export const createSession = base
	.meta({ auth: 'none' })
	.route({
		method: 'POST',
		path: '/sessions',
		successStatus: 201,
		tags: ['Sessions'],
		operationId: 'createSession',
		summary: 'Sign in with a username and password.',
		description:
			'Uses the same credential checks, rate limits (per IP and per username) and audit\nevents as the web login. The token is a session identifier with a 30-day sliding\nexpiry: every authenticated request in the second half of its lifetime extends it.\nThe IP limit is consumed before body parsing, including malformed requests. The\nJSON body must be at most 16 KiB; structurally valid bodies also consume the username limit.\n',
		successDescription: 'Signed in.',
		spec: withResponses({ '401': problemResponse('Wrong username or password.') })
	})
	.errors(
		problems(
			'bad_request',
			'invalid_credentials',
			'payload_too_large',
			'unsupported_media_type',
			'validation_failed',
			'rate_limited'
		)
	)
	.use(admitLogin)
	.use(auditInvalidBody({ eventType: 'login_attempt' }))
	.input(apiInput({ body: jsonBody(SessionCreateRequest) }))
	.output(unvalidated(SessionCreated))
	.handler(async ({ input, context }) => {
		const result = await loginWithPassword(
			{
				username: input.body.username,
				password: input.body.password,
				ip: context.ip,
				channel: context.channel
			},
			context.deps.login,
			{ ipAdmission: context.loginAdmission }
		);
		if (!result.ok) throw loginProblem(result);
		return {
			token: result.session.id,
			expiresAt: result.session.expiresAt.toISOString(),
			user: { username: result.user.username }
		};
	});

export const getCurrentSession = base
	.meta({ auth: 'required' })
	.route({
		method: 'GET',
		path: '/sessions/current',
		tags: ['Sessions'],
		operationId: 'getCurrentSession',
		summary: 'Get the signed-in user and the token expiry.',
		successDescription: 'The current session.'
	})
	.errors(problems('unauthorized'))
	.use(authenticated())
	.output(unvalidated(Session))
	.handler(async ({ context }) => {
		if (!context.session) throw problem('unauthorized', 'Du behöver logga in.');
		return {
			user: { username: context.user.username },
			expiresAt: context.session.expiresAt.toISOString()
		};
	});

export const deleteCurrentSession = base
	.meta({ auth: 'required' })
	.route({
		method: 'DELETE',
		path: '/sessions/current',
		successStatus: 204,
		tags: ['Sessions'],
		operationId: 'deleteCurrentSession',
		summary: 'Sign out and invalidate the token.',
		successDescription: 'Signed out.'
	})
	.errors(problems('unauthorized'))
	.use(authenticated())
	.output(unvalidated(z.void()))
	.handler(async ({ context }) => {
		if (!context.session) throw problem('unauthorized', 'Du behöver logga in.');
		await context.deps.sessions.invalidate(context.session.id);
		await context.deps.audit({
			eventType: 'logout',
			outcome: 'success',
			username: context.user.username,
			ip: context.ip,
			details: { channel: context.channel }
		});
	});
