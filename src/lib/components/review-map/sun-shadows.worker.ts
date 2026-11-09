import { calculateSunShadows } from '$lib/utils/sun-shadow-geometry';
import type { ShadowJob } from '$lib/types/sun-shadows';

self.onmessage = (event: MessageEvent<ShadowJob>) => {
	self.postMessage({ id: event.data.id, type: 'started' });
	self.postMessage(calculateSunShadows(event.data));
};
