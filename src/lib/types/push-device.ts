import type { ObjectId } from 'mongodb';

export type PushPlatform = 'ios' | 'android';

export type ApnsEnvironment = 'sandbox' | 'production';

/** A phone that gets a notification when a review is published for the first time. */
export interface PushDevice {
	_id?: ObjectId;
	token: string;
	platform: PushPlatform;
	/** iOS only: debug builds use the APNs sandbox, TestFlight builds production. */
	apnsEnvironment?: ApnsEnvironment;
	/** The signed-in user; missing for anonymous devices. */
	username?: string;
	createdAt: Date;
	updatedAt: Date;
}
