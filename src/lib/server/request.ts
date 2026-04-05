import type { RequestEvent } from '@sveltejs/kit';

const shouldTrustProxyHeaders = (): boolean => {
	return process.env.TRUST_PROXY === 'true';
};

export const getRequestIp = (event: RequestEvent): string => {
	if (shouldTrustProxyHeaders()) {
		const forwardedFor = event.request.headers.get('x-forwarded-for');
		if (forwardedFor) {
			const firstHop = forwardedFor.split(',')[0]?.trim();
			if (firstHop) return firstHop;
		}

		const realIp = event.request.headers.get('x-real-ip')?.trim();
		if (realIp) return realIp;
	}

	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
};
