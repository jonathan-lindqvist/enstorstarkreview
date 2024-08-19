import { Lucia } from 'lucia';
import { dev } from '$app/environment';
import db from '$lib/db/db';
import { MongodbAdapter } from '@lucia-auth/adapter-mongodb';
import type { User } from '$lib/types/user';

interface Session {
	_id: string;
	expires_at: Date;
	user_id: string;
}

const Users = db.collection<User>('users');
const Sessions = db.collection<Session>('sessions');

const adapter = new MongodbAdapter(Sessions, Users);

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
