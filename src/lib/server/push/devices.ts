import type { AuditEventInput } from '$lib/server/audit';
import type { consumeReviewRequestRateLimit } from '$lib/server/review-request-rate-limit';
import type { ApnsEnvironment, PushPlatform } from '$lib/types/push-device';

/** Shared by registration and removal; generous because phones behind one NAT share it. */
export const PUSH_DEVICE_IP_LIMIT = {
	maxAttempts: 60,
	windowMs: 60 * 60 * 1_000
} as const;

/** APNs tokens are 32 bytes today; allow Apple to lengthen them. */
const APNS_TOKEN_PATTERN = /^(?:[0-9a-f]{2}){32,100}$/;

export interface PushDeviceRegistration {
	platform: PushPlatform;
	token: string;
	apnsEnvironment?: ApnsEnvironment;
}

/** Null fields are removed from a stored device, so a signed-out phone becomes anonymous. */
export interface PushDeviceUpsert {
	token: string;
	platform: PushPlatform;
	apnsEnvironment: ApnsEnvironment | null;
	username: string | null;
}

export interface PushDeviceDependencies {
	upsertDevice(device: PushDeviceUpsert, now: Date): Promise<void>;
	removeDevice(tokens: string[]): Promise<void>;
	consumeRateLimit: typeof consumeReviewRequestRateLimit;
	audit(event: AuditEventInput): Promise<void>;
	now(): Date;
}

export type PushDeviceFailure =
	| { ok: false; status: 422; pointer: string; message: string }
	| { ok: false; status: 429; retryAfterSeconds: number; message: string }
	| { ok: false; status: 503; message: string };

export type PushDeviceResult = { ok: true } | PushDeviceFailure;

/** A server-owned admission, never read from a client request. */
export interface PushDeviceIpAdmission {
	ok: true;
	ip: string;
}

const UNAVAILABLE_MESSAGE = 'Notiser är tillfälligt otillgängliga. Försök igen senare.';

/** Admit before JSON parsing, so malformed and oversized requests also use the quota. */
export const admitPushDeviceIp = async (
	ip: string,
	deps: Pick<PushDeviceDependencies, 'consumeRateLimit' | 'audit'>
): Promise<PushDeviceIpAdmission | PushDeviceFailure> => {
	let limit;
	try {
		limit = await deps.consumeRateLimit('push_device_ip', ip, PUSH_DEVICE_IP_LIMIT);
	} catch (error) {
		console.error('Push device IP rate limit failed:', error);
		await deps.audit({
			eventType: 'push_device',
			outcome: 'failure',
			ip,
			reason: 'ip_rate_limit_failed'
		});
		return { ok: false, status: 503, message: UNAVAILABLE_MESSAGE };
	}
	if (limit.allowed) return { ok: true, ip };

	await deps.audit({
		eventType: 'push_device',
		outcome: 'rate_limited',
		ip,
		reason: 'ip_limit_exceeded',
		details: { retryAfterSeconds: limit.retryAfterSeconds }
	});
	return {
		ok: false,
		status: 429,
		retryAfterSeconds: limit.retryAfterSeconds,
		message: 'För många försök. Försök igen senare.'
	};
};

const invalid = (pointer: string, message: string): PushDeviceFailure => ({
	ok: false,
	status: 422,
	pointer,
	message
});

/** Registers or refreshes a device; the caller has validated the body against the contract. */
export const registerPushDevice = async (
	registration: PushDeviceRegistration,
	username: string | null,
	deps: Pick<PushDeviceDependencies, 'upsertDevice' | 'now'>
): Promise<PushDeviceResult> => {
	const { platform, apnsEnvironment } = registration;
	let token = registration.token;

	if (platform === 'ios') {
		token = token.toLowerCase();
		if (!APNS_TOKEN_PATTERN.test(token)) {
			return invalid('/token', 'Enhetens notis-token är ogiltig.');
		}
		if (!apnsEnvironment) {
			return invalid('/apnsEnvironment', 'Ange APNs-miljö för iOS.');
		}
	} else if (apnsEnvironment) {
		return invalid('/apnsEnvironment', 'APNs-miljö gäller bara iOS.');
	}

	try {
		await deps.upsertDevice(
			{ token, platform, apnsEnvironment: apnsEnvironment ?? null, username },
			deps.now()
		);
		return { ok: true };
	} catch (error) {
		console.error('Push device registration failed:', error);
		return { ok: false, status: 503, message: UNAVAILABLE_MESSAGE };
	}
};

/** Removes a device. Unknown tokens succeed, so removal reveals nothing about registrations. */
export const unregisterPushDevice = async (
	token: string,
	deps: Pick<PushDeviceDependencies, 'removeDevice'>
): Promise<PushDeviceResult> => {
	// iOS tokens are stored as lowercase hex; FCM tokens are case-sensitive.
	const lowercase = token.toLowerCase();
	const tokens = APNS_TOKEN_PATTERN.test(lowercase) ? [...new Set([token, lowercase])] : [token];
	try {
		await deps.removeDevice(tokens);
		return { ok: true };
	} catch (error) {
		console.error('Push device removal failed:', error);
		return { ok: false, status: 503, message: UNAVAILABLE_MESSAGE };
	}
};
