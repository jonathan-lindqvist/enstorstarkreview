import { apiHandler, jsonResponse, requireUser } from '#lib/server/api/http.js';
import type { ApiSchemas } from '#lib/server/api/openapi.js';
import { unauthorizedProblem } from '#lib/server/api/problem.js';
import { logAuditEvent } from '#lib/server/audit.js';
import { lucia } from '#lib/server/auth.js';
import { getRequestIp } from '#lib/server/request.js';

export const GET = apiHandler(async (event) => {
	const user = requireUser(event);
	if (user instanceof Response) return user;
	const { session } = event.locals;
	if (!session) return unauthorizedProblem();

	const body: ApiSchemas['Session'] = {
		user: { username: user.username },
		expiresAt: session.expiresAt.toISOString()
	};
	return jsonResponse(body);
});

export const DELETE = apiHandler(async (event) => {
	const user = requireUser(event);
	if (user instanceof Response) return user;
	const { session } = event.locals;
	if (!session) return unauthorizedProblem();

	await lucia.invalidateSession(session.id);
	await logAuditEvent({
		eventType: 'logout',
		outcome: 'success',
		username: user.username,
		ip: getRequestIp(event),
		details: { channel: 'api' }
	});
	return new Response(null, { status: 204 });
});
