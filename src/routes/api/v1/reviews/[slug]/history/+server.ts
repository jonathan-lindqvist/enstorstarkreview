import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import { notFoundProblem } from '$lib/server/api/problem';
import { toApiReviewHistory } from '$lib/server/api/reviews';
import { findVisibleReviewBySlug } from '$lib/server/reviews/queries';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';

export const GET = apiHandler(async (event) => {
	const slug = parseRouteSlug(event.params.slug ?? '');
	if (!slug) return notFoundProblem('Recensionen hittades inte');

	const review = await findVisibleReviewBySlug(slug, Boolean(event.locals.user));
	if (!review) return notFoundProblem('Recensionen hittades inte');

	return cachedJsonResponse(event, toApiReviewHistory(review));
});
