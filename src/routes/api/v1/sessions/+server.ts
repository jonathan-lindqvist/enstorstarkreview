import { apiHandler, jsonResponse, readJsonBody } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { problem } from '$lib/server/api/problem';
import { loginWithPassword } from '$lib/server/login/login';
import { loginDependencies } from '$lib/server/login/production';
import { getRequestIp } from '$lib/server/request';

export const POST = apiHandler(async (event) => {
	const body = await readJsonBody(event.request, 'SessionCreateRequest');
	if (!body.ok) return body.response;

	const result = await loginWithPassword(
		{
			username: body.value.username,
			password: body.value.password,
			ip: getRequestIp(event),
			channel: 'api'
		},
		loginDependencies
	);

	if (!result.ok) {
		return result.kind === 'rate_limited'
			? problem(429, 'rate_limited', result.message, {
					headers: { 'retry-after': String(result.retryAfterSeconds) }
				})
			: problem(401, 'invalid_credentials', result.message);
	}

	const session: ApiSchemas['SessionCreated'] = {
		token: result.session.id,
		expiresAt: result.session.expiresAt.toISOString(),
		user: { username: result.user.username }
	};
	return jsonResponse(session, { status: 201 });
});
