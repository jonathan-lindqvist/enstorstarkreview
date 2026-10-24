import { isApiPath } from './api/auth';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Native API requests use bearer credentials exclusively, including bodyless logout.
// Web writes use cookies and must carry the same origin before authentication or parsing.
export const isForbiddenWebOrigin = (request: Request, url: URL): boolean =>
	!isApiPath(url.pathname) &&
	MUTATING_METHODS.has(request.method) &&
	request.headers.get('origin') !== url.origin;
