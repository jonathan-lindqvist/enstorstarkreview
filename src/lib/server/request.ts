import { Context, Effect, Option } from 'effect';

/** Per-request facts that both doors supply: the client IP for audits and quotas. */
export class RequestContext extends Context.Service<RequestContext, { readonly ip: string }>()(
	'enstorstark/server/RequestContext'
) {}

export interface AuthenticatedUser {
	readonly id: string;
	readonly username: string;
}

export interface AuthenticatedSession {
	readonly id: string;
	readonly expiresAt: Date;
}

/**
 * Who is asking, if anyone. Public reads use it for draft visibility. The web door fills it
 * from the session cookie; the API door only from a bearer token.
 */
export class Viewer extends Context.Service<
	Viewer,
	{
		readonly user: Option.Option<AuthenticatedUser>;
		readonly session: Option.Option<AuthenticatedSession>;
	}
>()('enstorstark/server/Viewer') {
	static readonly anonymous = Viewer.of({ user: Option.none(), session: Option.none() });
	static readonly isAuthenticated = Viewer.use((viewer) =>
		Effect.succeed(Option.isSome(viewer.user))
	);
}

/** The signed-in user. Protected workflows require it, so they cannot run anonymously. */
export class CurrentUser extends Context.Service<
	CurrentUser,
	AuthenticatedUser & { readonly session: AuthenticatedSession }
>()('enstorstark/server/CurrentUser') {}

/**
 * The client IP. Proxy headers are trusted only with `TRUST_PROXY=true`; otherwise the socket
 * address is used, so clients cannot choose the IP their quota is charged to.
 */
export const resolveClientIp = (
	headers: Headers,
	trustProxy: boolean,
	getClientAddress: () => string
): string => {
	if (trustProxy) {
		const firstHop = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
		if (firstHop) return firstHop;
		const realIp = headers.get('x-real-ip')?.trim();
		if (realIp) return realIp;
	}

	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
};
