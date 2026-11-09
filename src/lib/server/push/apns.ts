import { connect, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { ApnsEnvironment, PushDevice } from '$lib/types/push-device';
import type { PushSender, PushSendReport } from './announce';
import { mapWithConcurrency } from './concurrency';
import type { ReviewNotification } from './message';

const APNS_ORIGINS: Record<ApnsEnvironment, string> = {
	production: 'https://api.push.apple.com',
	sandbox: 'https://api.sandbox.push.apple.com'
};
/** Apple accepts a provider token for an hour and rejects refreshes more often than every 20 minutes. */
const PROVIDER_TOKEN_LIFETIME_MS = 50 * 60 * 1_000;
/** A review notification is stale after a day; APNs drops it if the phone stays offline. */
const EXPIRATION_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 10;
const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered']);
const PROVIDER_TOKEN_REASONS = new Set(['ExpiredProviderToken', 'InvalidProviderToken']);

export interface ApnsResponse {
	status: number;
	body: string;
}

export interface ApnsTransport {
	post(
		origin: string,
		path: string,
		headers: Record<string, string>,
		body: string
	): Promise<ApnsResponse>;
	/** Closes the connections opened for one announcement. */
	close(): void;
}

export interface ApnsSenderConfig {
	keyId: string;
	teamId: string;
	/** The `.p8` key from Apple, PEM-encoded. */
	privateKey: string | KeyObject;
	bundleId: string;
	/** A transport per announcement, so concurrent announcements do not close each other's. */
	createTransport(): ApnsTransport;
	now(): Date;
}

const base64UrlJson = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

const readReason = (body: string): string | undefined => {
	try {
		const reason = (JSON.parse(body) as { reason?: unknown }).reason;
		return typeof reason === 'string' ? reason : undefined;
	} catch {
		return undefined;
	}
};

export const createApnsSender = (config: ApnsSenderConfig): PushSender => {
	const key =
		typeof config.privateKey === 'string' ? createPrivateKey(config.privateKey) : config.privateKey;
	let providerToken: { value: string; issuedAt: number } | null = null;

	const getProviderToken = (nowMs: number): string => {
		if (providerToken && nowMs - providerToken.issuedAt < PROVIDER_TOKEN_LIFETIME_MS) {
			return providerToken.value;
		}
		const signedPart = `${base64UrlJson({ alg: 'ES256', kid: config.keyId })}.${base64UrlJson({
			iss: config.teamId,
			iat: Math.floor(nowMs / 1_000)
		})}`;
		const signature = sign('sha256', Buffer.from(signedPart), { key, dsaEncoding: 'ieee-p1363' });
		providerToken = { value: `${signedPart}.${signature.toString('base64url')}`, issuedAt: nowMs };
		return providerToken.value;
	};

	const buildPayload = (notification: ReviewNotification) =>
		JSON.stringify({
			aps: {
				alert: { title: notification.title, body: notification.body },
				sound: 'default',
				'thread-id': 'new-reviews'
			},
			slug: notification.slug
		});

	return {
		async send(devices: PushDevice[], notification: ReviewNotification): Promise<PushSendReport> {
			const report: PushSendReport = { delivered: 0, failed: 0, invalidTokens: [] };
			const body = buildPayload(notification);
			const transport = config.createTransport();
			const nowMs = config.now().getTime();
			const headers = (): Record<string, string> => ({
				authorization: `bearer ${getProviderToken(nowMs)}`,
				'apns-topic': config.bundleId,
				'apns-push-type': 'alert',
				'apns-priority': '10',
				'apns-expiration': String(Math.floor(nowMs / 1_000) + EXPIRATION_SECONDS)
			});

			try {
				await mapWithConcurrency(devices, CONCURRENCY, async (device) => {
					const origin = APNS_ORIGINS[device.apnsEnvironment ?? 'production'];
					let response: ApnsResponse;
					try {
						response = await transport.post(origin, `/3/device/${device.token}`, headers(), body);
					} catch (error) {
						console.error('APNs request failed:', error);
						report.failed += 1;
						return;
					}

					if (response.status === 200) {
						report.delivered += 1;
						return;
					}
					report.failed += 1;
					const reason = readReason(response.body);
					if (response.status === 410 || (reason && INVALID_TOKEN_REASONS.has(reason))) {
						report.invalidTokens.push(device.token);
					} else if (reason && PROVIDER_TOKEN_REASONS.has(reason)) {
						providerToken = null;
					}
				});
			} finally {
				transport.close();
			}
			return report;
		}
	};
};

/** Production transport: one HTTP/2 session per APNs host, closed after each announcement. */
export const createHttp2ApnsTransport = (): ApnsTransport => {
	const sessions = new Map<string, ClientHttp2Session>();

	const getSession = (origin: string): ClientHttp2Session => {
		let session = sessions.get(origin);
		if (!session || session.closed || session.destroyed) {
			session = connect(origin);
			// Errors surface on the requests; without a listener they would crash the process.
			session.on('error', () => {});
			sessions.set(origin, session);
		}
		return session;
	};

	return {
		post: (origin, path, headers, body) =>
			new Promise<ApnsResponse>((resolve, reject) => {
				const request = getSession(origin).request({
					':method': 'POST',
					':path': path,
					'content-type': 'application/json',
					...headers
				});
				request.setTimeout(REQUEST_TIMEOUT_MS, () => {
					request.close();
					reject(new Error('APNs request timed out'));
				});
				let status = 0;
				const chunks: Buffer[] = [];
				request.on('response', (responseHeaders) => {
					status = Number(responseHeaders[':status']);
				});
				request.on('data', (chunk: Buffer) => chunks.push(chunk));
				request.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
				request.on('error', reject);
				request.end(body);
			}),
		close: () => {
			for (const session of sessions.values()) session.close();
			sessions.clear();
		}
	};
};
