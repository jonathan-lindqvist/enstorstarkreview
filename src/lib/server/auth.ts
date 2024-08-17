import { Lucia } from 'lucia';
import { dev } from '$app/environment';
import db from '$lib/db/db';
import { MongodbAdapter } from '@lucia-auth/adapter-mongodb';
import type { UserDoc } from '$lib/types/user';

const User = db.collection<UserDoc>('users');
const Session = db.collection<SessionDoc>('sessions');

const adapter = new MongodbAdapter(Session, User);

interface SessionDoc {
	_id: string;
	expires_at: Date;
	user_id: string;
}

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			// set to `true` when using HTTPS
			secure: !dev
		}
	},
	getUserAttributes: (attributes) => {
		return {
			// attributes has the type of DatabaseUserAttributes
			username: attributes.username
		};
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	username: string;
	password: string;
}
