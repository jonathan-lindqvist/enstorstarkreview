import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { PushDevice } from '$lib/types/push-device';
import type { PushSender, PushSendReport } from './announce';
import { mapWithConcurrency } from './concurrency';
import type { ReviewNotification } from './message';

/** Pinned rather than read from the service account file. */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const ASSERTION_LIFETIME_SECONDS = 3_600;
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 10;
/** Must match the channel the Android app creates. */
export const ANDROID_CHANNEL_ID = 'new_reviews';

export interface FcmServiceAccount {
	projectId: string;
	clientEmail: string;
	privateKey: string;
}

export interface FcmSenderConfig {
	serviceAccount: FcmServiceAccount;
	fetch: typeof globalThis.fetch;
	now(): Date;
}

const nonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

/** Reads the service-account JSON downloaded from Firebase; null when it is unusable. */
export const parseFcmServiceAccount = (value: string): FcmServiceAccount | null => {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	const { project_id, client_email, private_key } = parsed ?? {};
	if (
		!nonEmptyString(project_id) ||
		!nonEmptyString(client_email) ||
		!nonEmptyString(private_key)
	) {
		return null;
	}
	return { projectId: project_id, clientEmail: client_email, privateKey: private_key };
};

const base64UrlJson = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

interface FcmErrorBody {
	error?: { status?: unknown; message?: unknown; details?: { errorCode?: unknown }[] };
}

const isInvalidTokenError = (body: FcmErrorBody): boolean => {
	const error = body.error;
	const errorCodes = (Array.isArray(error?.details) ? error.details : []).map(
		(detail) => detail?.errorCode
	);
	// A 404 without UNREGISTERED can mean a wrong project, which must not delete every device.
	if (errorCodes.includes('UNREGISTERED')) return true;
	// INVALID_ARGUMENT also covers payload mistakes; only a token complaint may delete a device.
	return (
		errorCodes.includes('INVALID_ARGUMENT') &&
		typeof error?.message === 'string' &&
		/registration token/i.test(error.message)
	);
};

export const createFcmSender = (config: FcmSenderConfig): PushSender => {
	const { serviceAccount } = config;
	const key: KeyObject = createPrivateKey(serviceAccount.privateKey);
	const sendUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.projectId)}/messages:send`;
	let accessToken: { value: string; expiresAt: number } | null = null;

	const getAccessToken = async (): Promise<string> => {
		const nowMs = config.now().getTime();
		if (accessToken && nowMs < accessToken.expiresAt - ACCESS_TOKEN_REFRESH_MARGIN_MS) {
			return accessToken.value;
		}
		const iat = Math.floor(nowMs / 1_000);
		const signedPart = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson({
			iss: serviceAccount.clientEmail,
			scope: MESSAGING_SCOPE,
			aud: TOKEN_URL,
			iat,
			exp: iat + ASSERTION_LIFETIME_SECONDS
		})}`;
		const signature = sign('RSA-SHA256', Buffer.from(signedPart), key).toString('base64url');

		const response = await config.fetch(TOKEN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion: `${signedPart}.${signature}`
			}).toString(),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (!response.ok) {
			throw new Error(`FCM access token request failed with ${response.status}`);
		}
		const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
		if (!nonEmptyString(body.access_token) || typeof body.expires_in !== 'number') {
			throw new Error('FCM access token response was malformed');
		}
		accessToken = { value: body.access_token, expiresAt: nowMs + body.expires_in * 1_000 };
		return accessToken.value;
	};

	const buildMessage = (token: string, notification: ReviewNotification) =>
		JSON.stringify({
			message: {
				token,
				notification: { title: notification.title, body: notification.body },
				data: { slug: notification.slug },
				android: {
					priority: 'HIGH',
					ttl: '86400s',
					notification: { channel_id: ANDROID_CHANNEL_ID }
				}
			}
		});

	return {
		async send(devices: PushDevice[], notification: ReviewNotification): Promise<PushSendReport> {
			const report: PushSendReport = { delivered: 0, failed: 0, invalidTokens: [] };
			const authorization = `Bearer ${await getAccessToken()}`;

			await mapWithConcurrency(devices, CONCURRENCY, async (device) => {
				let response: Response;
				try {
					response = await config.fetch(sendUrl, {
						method: 'POST',
						headers: { authorization, 'content-type': 'application/json' },
						body: buildMessage(device.token, notification),
						signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
					});
				} catch (error) {
					console.error('FCM request failed:', error);
					report.failed += 1;
					return;
				}

				if (response.ok) {
					report.delivered += 1;
					return;
				}
				report.failed += 1;
				if (response.status === 401) accessToken = null;
				const body = (await response.json().catch(() => ({}))) as FcmErrorBody;
				if (isInvalidTokenError(body)) report.invalidTokens.push(device.token);
			});
			return report;
		}
	};
};
