import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PushDevice } from '$lib/types/push-device';
import { createFcmSender, parseFcmServiceAccount } from './fcm';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://fcm.googleapis.com/v1/projects/enstorstark/messages:send';
const notification = {
	title: 'Ny recension: Bar Himmel',
	body: 'Två stämplar',
	slug: 'bar-himmel'
};

const androidDevice = (token: string): PushDevice => ({
	token,
	platform: 'android',
	createdAt: new Date(0),
	updatedAt: new Date(0)
});

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fcmError = (status: number, code: string, errorCode?: string, message = 'error') =>
	json(status, {
		error: {
			code: status,
			status: code,
			message,
			details: errorCode
				? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }]
				: []
		}
	});

let clock = new Date('2026-11-09T12:00:00.000Z');

const createHarness = (respond: (token: string) => Response = () => json(200, { name: 'm' })) => {
	const calls: { url: string; init: RequestInit }[] = [];
	let accessTokens = 0;
	const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
		calls.push({ url: String(url), init });
		if (String(url) === TOKEN_URL) {
			accessTokens += 1;
			return json(200, { access_token: `access-${accessTokens}`, expires_in: 3599 });
		}
		const token = JSON.parse(String(init.body)).message.token;
		return respond(token);
	});
	const sender = createFcmSender({
		serviceAccount: {
			projectId: 'enstorstark',
			clientEmail: 'push@enstorstark.iam',
			privateKey: PEM
		},
		fetch: fetch as typeof globalThis.fetch,
		now: () => clock
	});
	return { sender, calls, fetch };
};

describe('FCM service account', () => {
	it('reads the fields it needs from the downloaded JSON', () => {
		expect(
			parseFcmServiceAccount(
				JSON.stringify({
					type: 'service_account',
					project_id: 'enstorstark',
					client_email: 'push@enstorstark.iam',
					private_key: PEM,
					token_uri: 'https://attacker.example/token'
				})
			)
		).toEqual({ projectId: 'enstorstark', clientEmail: 'push@enstorstark.iam', privateKey: PEM });
	});

	it.each(['', 'not json', '{}', '{"project_id":"x","client_email":"y"}'])(
		'rejects an incomplete account %j',
		(value) => {
			expect(parseFcmServiceAccount(value)).toBeNull();
		}
	);
});

describe('FCM sender', () => {
	it('gets an access token with a signed assertion and sends one message per device', async () => {
		const { sender, calls } = createHarness();

		const report = await sender.send(
			[androidDevice('token-1'), androidDevice('token-2')],
			notification
		);

		expect(report).toEqual({ delivered: 2, failed: 0, invalidTokens: [] });
		const [tokenCall, ...sends] = calls;
		expect(tokenCall.url).toBe(TOKEN_URL);
		const form = new URLSearchParams(String(tokenCall.init.body));
		expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
		const [header, claims, signature] = form.get('assertion')!.split('.');
		expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
			alg: 'RS256',
			typ: 'JWT'
		});
		const iat = Date.parse('2026-11-09T12:00:00Z') / 1000;
		expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
			iss: 'push@enstorstark.iam',
			scope: 'https://www.googleapis.com/auth/firebase.messaging',
			aud: TOKEN_URL,
			iat,
			exp: iat + 3600
		});
		expect(
			verify(
				'RSA-SHA256',
				Buffer.from(`${header}.${claims}`),
				publicKey,
				Buffer.from(signature, 'base64url')
			)
		).toBe(true);

		expect(sends.map(({ url }) => url)).toEqual([SEND_URL, SEND_URL]);
		expect(new Headers(sends[0].init.headers).get('authorization')).toBe('Bearer access-1');
		expect(JSON.parse(String(sends[0].init.body))).toEqual({
			message: {
				token: 'token-1',
				notification: { title: 'Ny recension: Bar Himmel', body: 'Två stämplar' },
				data: { slug: 'bar-himmel' },
				android: {
					priority: 'HIGH',
					ttl: '86400s',
					notification: { channel_id: 'new_reviews' }
				}
			}
		});
	});

	it('reuses the access token until shortly before it expires', async () => {
		const { sender, calls } = createHarness();
		const devices = [androidDevice('token-1')];

		await sender.send(devices, notification);
		clock = new Date('2026-11-09T12:58:00.000Z');
		await sender.send(devices, notification);
		clock = new Date('2026-11-09T12:59:30.000Z');
		await sender.send(devices, notification);

		expect(calls.filter(({ url }) => url === TOKEN_URL)).toHaveLength(2);
		clock = new Date('2026-11-09T12:00:00.000Z');
	});

	it('forgets unregistered tokens but keeps other failures', async () => {
		const { sender } = createHarness((token) => {
			if (token === 'gone') return fcmError(404, 'NOT_FOUND', 'UNREGISTERED');
			if (token === 'wrong-project') return fcmError(404, 'NOT_FOUND');
			if (token === 'malformed')
				return fcmError(
					400,
					'INVALID_ARGUMENT',
					'INVALID_ARGUMENT',
					'The registration token is not a valid FCM registration token'
				);
			if (token === 'bad-payload')
				return fcmError(
					400,
					'INVALID_ARGUMENT',
					'INVALID_ARGUMENT',
					'Invalid JSON payload received.'
				);
			return fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE');
		});

		const report = await sender.send(
			['gone', 'wrong-project', 'malformed', 'bad-payload', 'busy'].map(androidDevice),
			notification
		);

		expect(report.delivered).toBe(0);
		expect(report.failed).toBe(5);
		expect(report.invalidTokens.sort()).toEqual(['gone', 'malformed']);
	});

	it('fails the whole batch when no access token can be had', async () => {
		const fetch = vi.fn(async () => json(400, { error: 'invalid_grant' }));
		const sender = createFcmSender({
			serviceAccount: { projectId: 'p', clientEmail: 'e', privateKey: PEM },
			fetch: fetch as typeof globalThis.fetch,
			now: () => clock
		});

		await expect(sender.send([androidDevice('token-1')], notification)).rejects.toThrow(
			'FCM access token request failed with 400'
		);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
