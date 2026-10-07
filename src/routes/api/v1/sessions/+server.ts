import { apiHandler, jsonResponse, readJsonBody } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { problem } from '$lib/server/api/problem';
import { admitLoginIp, loginWithPassword, type LoginResult } from '$lib/server/login/login';
import { loginDependencies } from '$lib/server/login/production';
import { getRequestIp } from '$lib/server/request';

const loginProblem = (result: Extract<LoginResult<never>, { ok: false }>) =>
	result.kind === 'rate_limited'
		? problem(429, 'rate_limited', result.message, {
				headers: { 'retry-after': String(result.retryAfterSeconds) }
			})
		: problem(401, 'invalid_credentials', result.message);

export const POST = apiHandler(async (event) => {
	const ip = getRequestIp(event);
	const admission = await admitLoginIp({ ip, channel: 'api' }, loginDependencies);
	if (!admission.ok) return loginProblem(admission);

	const body = await readJsonBody(event.request, 'SessionCreateRequest');
	if (!body.ok) {
		await loginDependencies.audit({
			eventType: 'login_attempt',
			outcome: 'failure',
			ip,
			reason: 'invalid_api_body',
			details: { channel: 'api' }
		});
		return body.response;
	}

	const result = await loginWithPassword(
		{
			username: body.value.username,
			password: body.value.password,
			ip,
			channel: 'api'
		},
		loginDependencies,
		{ ipAdmission: admission }
	);

	if (!result.ok) {
		return loginProblem(result);
	}

	const session: ApiSchemas['SessionCreated'] = {
		token: result.session.id,
		expiresAt: result.session.expiresAt.toISOString(),
		user: { username: result.user.username }
	};
	return jsonResponse(session, { status: 201 });
});
