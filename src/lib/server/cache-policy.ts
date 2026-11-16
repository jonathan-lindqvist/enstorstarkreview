interface ResponseCacheContext {
	method: string;
	routeId: string | null;
	isApiRequest: boolean;
	hasSessionCookie: boolean;
	isAuthenticated: boolean;
}

const publicWebRoutes = new Set(['/feed.xml', '/sitemap.xml', '/images/[filename]']);

/** Restricts dynamic web responses without changing the API's bearer-cache contract. */
export const applyResponseCachePolicy = (
	response: Response,
	{ method, routeId, isApiRequest, hasSessionCookie, isAuthenticated }: ResponseCacheContext
): void => {
	if (
		response.headers.has('set-cookie') ||
		(!isApiRequest && (hasSessionCookie || isAuthenticated))
	) {
		response.headers.set('cache-control', 'private, no-store');
		return;
	}
	if (isApiRequest) return;

	const directives = (response.headers.get('cache-control') ?? '')
		.toLowerCase()
		.split(',')
		.map((directive) => directive.trim());
	if (directives.includes('no-store')) return;

	const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	const isHtml = contentType === 'text/html' || contentType === 'application/xhtml+xml';
	const canShare =
		(method === 'GET' || method === 'HEAD') &&
		(response.ok || response.status === 304) &&
		routeId !== null &&
		publicWebRoutes.has(routeId) &&
		!isHtml &&
		directives.includes('public');
	if (!canShare) response.headers.set('cache-control', 'private, no-store');
};
