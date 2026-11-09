import type { PushDeviceResult } from '$lib/server/push/devices';
import { problem, validationProblem } from './problem';

/** Maps a push-device workflow result to the API response; success has no body. */
export const pushDeviceResponse = (result: PushDeviceResult): Response => {
	if (result.ok)
		return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
	if (result.status === 422) {
		return validationProblem([{ pointer: result.pointer, detail: result.message }], result.message);
	}
	if (result.status === 429) {
		return problem(429, 'rate_limited', result.message, {
			headers: { 'retry-after': String(result.retryAfterSeconds) }
		});
	}
	return problem(503, 'service_unavailable', result.message);
};
