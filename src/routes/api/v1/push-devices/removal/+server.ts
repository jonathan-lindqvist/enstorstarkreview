import { apiHandler, readJsonBody } from '$lib/server/api/http';
import { pushDeviceResponse } from '$lib/server/api/push-devices';
import { admitPushDeviceIp, unregisterPushDevice } from '$lib/server/push/devices';
import { pushDeviceDependencies } from '$lib/server/push/production';
import { getRequestIp } from '$lib/server/request';

export const POST = apiHandler(async (event) => {
	const admission = await admitPushDeviceIp(getRequestIp(event), pushDeviceDependencies);
	if (!admission.ok) return pushDeviceResponse(admission);

	const body = await readJsonBody(event.request, 'PushDeviceRemoval');
	if (!body.ok) return body.response;

	return pushDeviceResponse(await unregisterPushDevice(body.value.token, pushDeviceDependencies));
});
