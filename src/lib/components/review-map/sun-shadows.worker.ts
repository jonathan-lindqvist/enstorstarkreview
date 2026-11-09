import { createSunShadowCalculator } from '$lib/utils/sun-shadow-geometry';
import type { ShadowFrame } from '$lib/types/sun-shadows';

const calculate = createSunShadowCalculator();

self.onmessage = (event: MessageEvent<ShadowFrame>) => {
	self.postMessage({ id: event.data.id, type: 'started' });
	self.postMessage(calculate(event.data));
};
