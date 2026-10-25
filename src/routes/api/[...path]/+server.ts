import { handleApiRequest } from '$lib/server/rpc/http';
import type { RequestHandler } from './$types';

// The native API: every `/api/*` request goes to the oRPC router. Unknown paths, including
// anything outside `/api/v1`, get a problem response instead of the HTML error page.
export const fallback: RequestHandler = (event) => handleApiRequest(event);
