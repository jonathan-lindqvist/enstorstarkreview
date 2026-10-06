import { apiHandler, jsonResponse, readJsonBody } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { problem, validationProblem } from '$lib/server/api/problem';
import { getRequestIp } from '$lib/server/request';
import { reviewRequestDependencies } from '$lib/server/review-requests/production';
import { submitReviewRequest } from '$lib/server/review-requests/submit';

export const POST = apiHandler(async (event) => {
	const body = await readJsonBody(event.request, 'ReviewRequestCreateRequest');
	if (!body.ok) return body.response;

	// The web form's honeypot does not apply to native clients; the rate limits still do.
	const data = new FormData();
	data.set('barName', body.value.barName);
	data.set('location', body.value.location);
	data.set('motivation', body.value.motivation ?? '');

	const result = await submitReviewRequest(data, getRequestIp(event), reviewRequestDependencies);
	if (result.ok) {
		const accepted: ApiSchemas['ReviewRequestAccepted'] = { message: result.data.message };
		return jsonResponse(accepted, { status: 202 });
	}

	const { message, fieldErrors } = result.data;
	if (result.status === 400) {
		return validationProblem(
			Object.entries(fieldErrors ?? {}).map(([field, detail]) => ({
				pointer: `/${field}`,
				detail: detail ?? message
			})),
			message
		);
	}
	if (result.status === 429) {
		return problem(429, 'rate_limited', message, {
			headers:
				result.retryAfterSeconds === undefined
					? {}
					: { 'retry-after': String(result.retryAfterSeconds) }
		});
	}
	return problem(result.status, 'service_unavailable', message);
});
