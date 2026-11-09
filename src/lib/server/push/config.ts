import { createPrivateKey } from 'node:crypto';
import { parseFcmServiceAccount, type FcmServiceAccount } from './fcm';

const DEFAULT_APNS_BUNDLE_ID = 'se.enstorstarkreview.app';

export interface ApnsCredentials {
	keyId: string;
	teamId: string;
	privateKey: string;
	bundleId: string;
}

export interface PushConfig {
	apns: ApnsCredentials | null;
	fcm: FcmServiceAccount | null;
	/** Safe to log: names settings, never values. */
	problems: string[];
}

const isPrivateKey = (pem: string): boolean => {
	try {
		createPrivateKey(pem);
		return true;
	} catch {
		return false;
	}
};

const readText = (value: string | undefined): string => value?.trim() ?? '';

/** A service without any of its settings is off without a problem, as in development and CI. */
export const readPushConfig = (env: Record<string, string | undefined>): PushConfig => {
	const problems: string[] = [];

	let apns: ApnsCredentials | null = null;
	const keyId = readText(env.APNS_KEY_ID);
	const teamId = readText(env.APNS_TEAM_ID);
	// .env files keep the .p8 key on one line with escaped newlines.
	const privateKey = readText(env.APNS_PRIVATE_KEY).replace(/\\n/g, '\n');
	if (keyId && teamId && privateKey) {
		if (isPrivateKey(privateKey)) {
			apns = {
				keyId,
				teamId,
				privateKey,
				bundleId: readText(env.APNS_BUNDLE_ID) || DEFAULT_APNS_BUNDLE_ID
			};
		} else {
			problems.push('APNs is off: APNS_PRIVATE_KEY is not a PEM private key.');
		}
	} else if (keyId || teamId || privateKey) {
		problems.push('APNs is off: set APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY.');
	}

	let fcm: FcmServiceAccount | null = null;
	const serviceAccountJson = readText(env.FCM_SERVICE_ACCOUNT_JSON);
	if (serviceAccountJson) {
		const account = parseFcmServiceAccount(serviceAccountJson);
		if (account && isPrivateKey(account.privateKey)) {
			fcm = account;
		} else {
			problems.push('FCM is off: FCM_SERVICE_ACCOUNT_JSON is not a usable service account.');
		}
	}

	return { apns, fcm, problems };
};
