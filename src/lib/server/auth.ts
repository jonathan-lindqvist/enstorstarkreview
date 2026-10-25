import { Lucia, type Cookie, type Session, type User as LuciaUser } from 'lucia';
import { MongodbAdapter } from '@lucia-auth/adapter-mongodb';
import { Context, Effect, Layer } from 'effect';
import type { Collection } from 'mongodb';
import { Mongo, tryMongo, type MongoError, type SessionDocument } from '$lib/server/platform/mongo';
import { dev } from '$app/environment';

const createLucia = (
	sessions: Collection<SessionDocument>,
	users: ConstructorParameters<typeof MongodbAdapter>[1],
	secure: boolean
) =>
	new Lucia(new MongodbAdapter(sessions, users), {
		sessionCookie: { attributes: { secure } },
		getUserAttributes: (attributes) => ({ username: attributes.username })
	});

declare module 'lucia' {
	interface Register {
		Lucia: ReturnType<typeof createLucia>;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
	username: string;
	password: string;
}

export interface SessionValidation {
	user: LuciaUser | null;
	session: Session | null;
}

/** Lucia sessions: cookies for the web door, bearer tokens for the API door. */
export class Sessions extends Context.Service<
	Sessions,
	{
		readonly sessionCookieName: string;
		validate(sessionId: string): Effect.Effect<SessionValidation, MongoError>;
		create(userId: string): Effect.Effect<Session, MongoError>;
		invalidate(sessionId: string): Effect.Effect<void, MongoError>;
		sessionCookie(sessionId: string): Cookie;
		blankSessionCookie(): Cookie;
	}
>()('enstorstark/server/Sessions') {
	static readonly layer = Layer.effect(
		Sessions,
		Effect.gen(function* () {
			const { collections } = yield* Mongo;
			const lucia = createLucia(
				collections.sessions,
				collections.users as never,
				// Secure everywhere except the Vite dev server, which runs over plain HTTP.
				!dev
			);
			return Sessions.of({
				sessionCookieName: lucia.sessionCookieName,
				validate: (sessionId) => tryMongo(() => lucia.validateSession(sessionId)),
				create: (userId) => tryMongo(() => lucia.createSession(userId, {})),
				invalidate: (sessionId) => tryMongo(() => lucia.invalidateSession(sessionId)),
				sessionCookie: (sessionId) => lucia.createSessionCookie(sessionId),
				blankSessionCookie: () => lucia.createBlankSessionCookie()
			});
		})
	);
}

/** Returns the token from `Authorization: Bearer <token>`, or null. */
export const readBearerToken = (authorization: string | null | undefined): string | null => {
	const match = authorization?.match(/^Bearer +([^\s]+) *$/i);
	return match?.[1] ?? null;
};
