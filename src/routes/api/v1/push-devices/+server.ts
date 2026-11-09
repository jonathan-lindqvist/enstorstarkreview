import { readBearerToken } from '$lib/server/api/auth';
import { apiHandler, readJsonBody } from '$lib/server/api/http';
import { unauthorizedProblem } from '$lib/server/api/problem';
import { pushDeviceResponse } from '$lib/server/api/push-devices';
import { admitPushDeviceIp, registerPushDevice } from '$lib/server/push/devices';
import { pushDeviceDependencies } from '$lib/server/push/production';
import { getRequestIp } from '$lib/server/request';

export const PUT = apiHandler(async (event) => {
	const ip = getRequestIp(event);
	const admission = await admitPushDeviceIp(ip, pushDeviceDependencies);
	if (!admission.ok) return pushDeviceResponse(admission);

	// A rejected token must not quietly turn a reviewer's phone anonymous.
	if (readBearerToken(event.request.headers.get('authorization')) && !event.locals.user) {
		await pushDeviceDependencies.audit({
			eventType: 'push_device',
			outcome: 'denied',
			ip,
			reason: 'invalid_api_token'
		});
		return unauthorizedProblem();
	}

	const body = await readJsonBody(event.request, 'PushDeviceRegistration');
	if (!body.ok) return body.response;

	const result = await registerPushDevice(
		body.value,
		event.locals.user?.username ?? null,
		pushDeviceDependencies
	);
	return pushDeviceResponse(result);
});
