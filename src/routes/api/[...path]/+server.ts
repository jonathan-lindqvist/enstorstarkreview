import { notFoundProblem } from '$lib/server/api/problem';
import type { RequestHandler } from './$types';

// Unknown API paths get a JSON problem instead of the HTML error page.
export const fallback: RequestHandler = async () => notFoundProblem();
