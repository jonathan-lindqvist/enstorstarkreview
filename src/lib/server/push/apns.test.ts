import { createServer, type Http2Server } from 'node:http2';
import { generateKeyPairSync, verify } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushDevice } from '$lib/types/push-device';
import {
	createApnsSender,
	createHttp2ApnsTransport,
	type ApnsResponse,
	type ApnsTransport
} from './apns';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const notification = {
	title: 'Ny recension: Bar Himmel',
	body: 'Två stämplar',
	slug: 'bar-himmel'
};

const iosDevice = (token: string, apnsEnvironment: 'sandbox' | 'production'): PushDevice => ({
	token,
	platform: 'ios',
	apnsEnvironment,
	createdAt: new Date(0),
	updatedAt: new Date(0)
});

const fakeTransport = (
	respond: (path: string) => ApnsResponse = () => ({ status: 200, body: '' })
) => {
	const requests: {
		origin: string;
		path: string;
		headers: Record<string, string>;
		body: string;
	}[] = [];
	const transport: ApnsTransport & {
		requests: typeof requests;
		close: ReturnType<typeof vi.fn<() => void>>;
	} = {
		requests,
		post: async (origin, path, headers, body) => {
			requests.push({ origin, path, headers, body });
			return respond(path);
		},
		close: vi.fn<() => void>()
	};
	return transport;
};

const decodeJwt = (authorization: string) => {
	const [header, claims, signature] = authorization.replace(/^bearer /, '').split('.');
	const json = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
	return {
		header: json(header),
		claims: json(claims),
		signedPart: `${header}.${claims}`,
		signature
	};
};

let clock = new Date('2026-11-09T12:00:00.000Z');
const config = (transport: ApnsTransport) => ({
	keyId: 'ABC123DEFG',
	teamId: 'FF8JDK3FMJ',
	privateKey: PEM,
	bundleId: 'se.enstorstarkreview.app',
	createTransport: () => transport,
	now: () => clock
});

describe('APNs sender', () => {
	afterEach(() => {
		clock = new Date('2026-11-09T12:00:00.000Z');
	});

	it('posts an alert to the right APNs host for each device environment', async () => {
		const transport = fakeTransport();
		const sender = createApnsSender(config(transport));

		const report = await sender.send(
			[iosDevice('a'.repeat(64), 'production'), iosDevice('b'.repeat(64), 'sandbox')],
			notification
		);

		expect(report).toEqual({ delivered: 2, failed: 0, invalidTokens: [] });
		expect(transport.requests.map(({ origin, path }) => [origin, path])).toEqual([
			['https://api.push.apple.com', `/3/device/${'a'.repeat(64)}`],
			['https://api.sandbox.push.apple.com', `/3/device/${'b'.repeat(64)}`]
		]);
		const [request] = transport.requests;
		expect(request.headers).toMatchObject({
			'apns-topic': 'se.enstorstarkreview.app',
			'apns-push-type': 'alert',
			'apns-priority': '10',
			'apns-expiration': String(Date.parse('2026-11-10T12:00:00.000Z') / 1000)
		});
		expect(JSON.parse(request.body)).toEqual({
			aps: {
				alert: { title: 'Ny recension: Bar Himmel', body: 'Två stämplar' },
				sound: 'default',
				'thread-id': 'new-reviews'
			},
			slug: 'bar-himmel'
		});
		expect(transport.close).toHaveBeenCalledTimes(1);
	});

	it('signs a provider token with the key and reuses it for 50 minutes', async () => {
		const transport = fakeTransport();
		const sender = createApnsSender(config(transport));
		const device = iosDevice('a'.repeat(64), 'production');

		await sender.send([device], notification);
		clock = new Date('2026-11-09T12:49:00.000Z');
		await sender.send([device], notification);
		clock = new Date('2026-11-09T12:51:00.000Z');
		await sender.send([device], notification);

		const tokens = transport.requests.map(({ headers }) => headers.authorization);
		expect(tokens[1]).toBe(tokens[0]);
		expect(tokens[2]).not.toBe(tokens[0]);

		const jwt = decodeJwt(tokens[0]);
		expect(jwt.header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
		expect(jwt.claims).toEqual({
			iss: 'FF8JDK3FMJ',
			iat: Date.parse('2026-11-09T12:00:00Z') / 1000
		});
		expect(
			verify(
				'sha256',
				Buffer.from(jwt.signedPart),
				{ key: publicKey, dsaEncoding: 'ieee-p1363' },
				Buffer.from(jwt.signature, 'base64url')
			)
		).toBe(true);
	});

	it('reports gone and foreign tokens as invalid and other errors as failed', async () => {
		const responses: Record<string, ApnsResponse> = {
			gone: { status: 410, body: '{"reason":"Unregistered"}' },
			bad: { status: 400, body: '{"reason":"BadDeviceToken"}' },
			topic: { status: 400, body: '{"reason":"DeviceTokenNotForTopic"}' },
			busy: { status: 503, body: '{"reason":"ServiceUnavailable"}' },
			payload: { status: 400, body: '{"reason":"PayloadTooLarge"}' }
		};
		const tokens = Object.fromEntries(
			Object.keys(responses).map((name, index) => [name, String(index).repeat(64)])
		);
		const transport = fakeTransport((path) => {
			const name = Object.keys(tokens).find((key) => path.endsWith(tokens[key]))!;
			return responses[name];
		});
		const sender = createApnsSender(config(transport));

		const report = await sender.send(
			Object.values(tokens).map((token) => iosDevice(token, 'production')),
			notification
		);

		expect(report.delivered).toBe(0);
		expect(report.failed).toBe(5);
		expect(report.invalidTokens.sort()).toEqual([tokens.gone, tokens.bad, tokens.topic].sort());
	});

	it('counts a transport error as a failure for that device only', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const transport = fakeTransport();
		const post = transport.post;
		transport.post = async (origin, path, headers, body) => {
			if (path.endsWith('c'.repeat(64))) throw new Error('stream reset');
			return post(origin, path, headers, body);
		};
		const sender = createApnsSender(config(transport));

		const report = await sender.send(
			[iosDevice('c'.repeat(64), 'production'), iosDevice('d'.repeat(64), 'production')],
			notification
		);

		expect(report).toEqual({ delivered: 1, failed: 1, invalidTokens: [] });
		expect(transport.close).toHaveBeenCalledTimes(1);
		vi.restoreAllMocks();
	});
});

describe('HTTP/2 APNs transport', () => {
	let server: Http2Server | undefined;
	afterEach(() => {
		server?.close();
		server = undefined;
	});

	it('sends the request over one HTTP/2 session and returns status and body', async () => {
		const seen: Record<string, unknown>[] = [];
		server = createServer();
		server.on('stream', (stream, headers) => {
			let body = '';
			stream.on('data', (chunk) => (body += chunk));
			stream.on('end', () => {
				seen.push({ ...headers, body });
				stream.respond({ ':status': 410 });
				stream.end('{"reason":"Unregistered"}');
			});
		});
		await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		const transport = createHttp2ApnsTransport();
		const first = await transport.post(origin, '/3/device/abc', { 'apns-topic': 'x' }, '{"a":1}');
		const second = await transport.post(origin, '/3/device/def', { 'apns-topic': 'x' }, '{}');
		transport.close();

		expect(first).toEqual({ status: 410, body: '{"reason":"Unregistered"}' });
		expect(second.status).toBe(410);
		expect(seen[0]).toMatchObject({
			':method': 'POST',
			':path': '/3/device/abc',
			'apns-topic': 'x',
			body: '{"a":1}'
		});
	});
});
