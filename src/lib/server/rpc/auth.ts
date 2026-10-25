export const API_PATH_PREFIX = '/api/';

export const isApiPath = (pathname: string): boolean => pathname.startsWith(API_PATH_PREFIX);

/** Returns the token from `Authorization: Bearer <token>`, or null. */
export const readBearerToken = (authorization: string | null): string | null => {
	const match = authorization?.match(/^Bearer +([^\s]+) *$/i);
	return match?.[1] ?? null;
};

export interface ApiSessionValidation<TUser, TSession> {
	user: TUser | null;
	session: TSession | null;
}

/**
 * Authenticates an API request from its bearer token only. The web session cookie is
 * deliberately ignored, so browser pages cannot make credentialed cross-site API calls.
 */
export const authenticateApiRequest = async <TUser, TSession>(
	authorization: string | null,
	validateSession: (token: string) => Promise<ApiSessionValidation<TUser, TSession>>
): Promise<ApiSessionValidation<TUser, TSession>> => {
	const token = readBearerToken(authorization);
	if (!token) return { user: null, session: null };

	const { user, session } = await validateSession(token);
	return session && user ? { user, session } : { user: null, session: null };
};
