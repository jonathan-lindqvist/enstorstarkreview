import db from '$lib/db/db';
import type { PushDevice } from '$lib/types/push-device';

export const pushDevices = db.collection<PushDevice>('push_devices');
