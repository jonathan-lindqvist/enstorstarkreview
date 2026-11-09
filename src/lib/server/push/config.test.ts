import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readPushConfig } from './config';

const ecKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
	.privateKey.export({ format: 'pem', type: 'pkcs8' })
	.toString();
const rsaKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
	.privateKey.export({ format: 'pem', type: 'pkcs8' })
	.toString();
const serviceAccount = JSON.stringify({
	project_id: 'enstorstark',
	client_email: 'push@enstorstark.iam',
	private_key: rsaKey
});

describe('push configuration', () => {
	it('turns both services off without credentials, quietly', () => {
		expect(readPushConfig({})).toEqual({ apns: null, fcm: null, problems: [] });
	});

	it('reads APNs credentials, with the key on one line and the default bundle ID', () => {
		const config = readPushConfig({
			APNS_KEY_ID: 'ABC123DEFG',
			APNS_TEAM_ID: 'FF8JDK3FMJ',
			APNS_PRIVATE_KEY: ecKey.replace(/\n/g, '\\n')
		});
		expect(config.apns).toEqual({
			keyId: 'ABC123DEFG',
			teamId: 'FF8JDK3FMJ',
			privateKey: ecKey,
			bundleId: 'se.enstorstarkreview.app'
		});
		expect(config.problems).toEqual([]);
	});

	it('reads the FCM service account', () => {
		expect(readPushConfig({ FCM_SERVICE_ACCOUNT_JSON: serviceAccount }).fcm).toEqual({
			projectId: 'enstorstark',
			clientEmail: 'push@enstorstark.iam',
			privateKey: rsaKey
		});
	});

	it('turns a service off and names the problem, without the secret, when it is incomplete or broken', () => {
		const config = readPushConfig({
			APNS_KEY_ID: 'ABC123DEFG',
			APNS_PRIVATE_KEY: 'secret-not-a-key',
			FCM_SERVICE_ACCOUNT_JSON: '{"private_key":"secret-value"}'
		});
		expect(config.apns).toBeNull();
		expect(config.fcm).toBeNull();
		expect(config.problems).toEqual([
			'APNs is off: set APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY.',
			'FCM is off: FCM_SERVICE_ACCOUNT_JSON is not a usable service account.'
		]);
		expect(JSON.stringify(config.problems)).not.toContain('secret');

		expect(
			readPushConfig({ APNS_KEY_ID: 'A', APNS_TEAM_ID: 'B', APNS_PRIVATE_KEY: 'secret' }).problems
		).toEqual(['APNs is off: APNS_PRIVATE_KEY is not a PEM private key.']);
	});
});
