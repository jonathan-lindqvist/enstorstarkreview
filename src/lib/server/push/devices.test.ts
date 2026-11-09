import { describe, expect, it, vi } from 'vitest';
import {
	PUSH_DEVICE_IP_LIMIT,
	admitPushDeviceIp,
	registerPushDevice,
	unregisterPushDevice,
	type PushDeviceDependencies
} from './devices';

const IOS_TOKEN = 'A1'.repeat(32);
const ANDROID_TOKEN = 'd9Xk2:APA91b' + 'x_-'.repeat(50);

const createDependencies = (): PushDeviceDependencies & {
	upsertDevice: ReturnType<typeof vi.fn>;
	removeDevice: ReturnType<typeof vi.fn>;
	consumeRateLimit: ReturnType<typeof vi.fn>;
	audit: ReturnType<typeof vi.fn>;
} => ({
	upsertDevice: vi.fn(async () => {}),
	removeDevice: vi.fn(async () => {}),
	consumeRateLimit: vi.fn(async () => ({
		allowed: true,
		retryAfterSeconds: 0,
		remainingAttempts: 59
	})),
	audit: vi.fn(async () => {}),
	now: () => new Date('2026-11-09T12:00:00.000Z')
});

describe('push device admission', () => {
	it('charges the IP quota with its own scope', async () => {
		const deps = createDependencies();
		expect(await admitPushDeviceIp('203.0.113.9', deps)).toEqual({ ok: true, ip: '203.0.113.9' });
		expect(deps.consumeRateLimit).toHaveBeenCalledWith(
			'push_device_ip',
			'203.0.113.9',
			PUSH_DEVICE_IP_LIMIT
		);
	});

	it('denies an exhausted quota with the retry delay', async () => {
		const deps = createDependencies();
		deps.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 120,
			remainingAttempts: 0
		});
		expect(await admitPushDeviceIp('203.0.113.9', deps)).toMatchObject({
			ok: false,
			status: 429,
			retryAfterSeconds: 120
		});
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: 'push_device', outcome: 'rate_limited' })
		);
	});

	it('fails closed when the quota cannot be checked', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = createDependencies();
		deps.consumeRateLimit.mockRejectedValueOnce(new Error('mongo down'));
		expect(await admitPushDeviceIp('203.0.113.9', deps)).toMatchObject({ ok: false, status: 503 });
		vi.restoreAllMocks();
	});
});

describe('push device registration', () => {
	it('stores an iOS device as lowercase hex with its APNs environment and user', async () => {
		const deps = createDependencies();
		const result = await registerPushDevice(
			{ platform: 'ios', token: IOS_TOKEN, apnsEnvironment: 'sandbox' },
			'alice',
			deps
		);
		expect(result).toEqual({ ok: true });
		expect(deps.upsertDevice).toHaveBeenCalledWith(
			{
				token: IOS_TOKEN.toLowerCase(),
				platform: 'ios',
				apnsEnvironment: 'sandbox',
				username: 'alice'
			},
			new Date('2026-11-09T12:00:00.000Z')
		);
	});

	it('stores an anonymous Android device without an APNs environment', async () => {
		const deps = createDependencies();
		expect(
			await registerPushDevice({ platform: 'android', token: ANDROID_TOKEN }, null, deps)
		).toEqual({ ok: true });
		expect(deps.upsertDevice).toHaveBeenCalledWith(
			{ token: ANDROID_TOKEN, platform: 'android', apnsEnvironment: null, username: null },
			expect.any(Date)
		);
	});

	it.each([
		[
			'an iOS token that is not hex',
			{ platform: 'ios', token: 'z'.repeat(64), apnsEnvironment: 'production' },
			'/token'
		],
		[
			'an iOS token of odd length',
			{ platform: 'ios', token: 'a'.repeat(65), apnsEnvironment: 'production' },
			'/token'
		],
		[
			'an iOS device without an environment',
			{ platform: 'ios', token: IOS_TOKEN },
			'/apnsEnvironment'
		],
		[
			'an Android device with an APNs environment',
			{ platform: 'android', token: ANDROID_TOKEN, apnsEnvironment: 'sandbox' },
			'/apnsEnvironment'
		]
	] as const)('rejects %s without storing it', async (_, input, pointer) => {
		const deps = createDependencies();
		const result = await registerPushDevice(input, null, deps);
		expect(result).toMatchObject({ ok: false, status: 422, pointer });
		expect(deps.upsertDevice).not.toHaveBeenCalled();
	});

	it('reports a storage failure as unavailable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = createDependencies();
		deps.upsertDevice.mockRejectedValueOnce(new Error('mongo down'));
		expect(
			await registerPushDevice({ platform: 'android', token: ANDROID_TOKEN }, null, deps)
		).toMatchObject({ ok: false, status: 503 });
		vi.restoreAllMocks();
	});
});

describe('push device removal', () => {
	it('removes both token spellings so an uppercase iOS token is found', async () => {
		const deps = createDependencies();
		expect(await unregisterPushDevice(IOS_TOKEN, deps)).toEqual({ ok: true });
		expect(deps.removeDevice).toHaveBeenCalledWith([IOS_TOKEN, IOS_TOKEN.toLowerCase()]);
	});

	it('removes an Android token as given', async () => {
		const deps = createDependencies();
		await unregisterPushDevice(ANDROID_TOKEN, deps);
		expect(deps.removeDevice).toHaveBeenCalledWith([ANDROID_TOKEN]);
	});

	it('reports a storage failure as unavailable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = createDependencies();
		deps.removeDevice.mockRejectedValueOnce(new Error('mongo down'));
		expect(await unregisterPushDevice(ANDROID_TOKEN, deps)).toMatchObject({
			ok: false,
			status: 503
		});
		vi.restoreAllMocks();
	});
});
