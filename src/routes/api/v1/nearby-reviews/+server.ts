import { bars } from '$lib/db/bars';
import { MAX_SHORT_TEXT } from '$lib/constants';
import { apiHandler, jsonResponse, requireUser } from '$lib/server/api/http';
import { toApiNearbyReviews } from '$lib/server/api/nearby-reviews';
import { notFoundProblem, problem } from '$lib/server/api/problem';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { loadNearbyReviewComparison } from '$lib/server/reviews/nearby-comparison';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';

const badRequest = (detail: string) => problem(400, 'bad_request', detail);

export const GET = apiHandler(async (event) => {
	// Counts include drafts, so authenticate before reading anything.
	const user = requireUser(event);
	if (user instanceof Response) return user;

	const params = event.url.searchParams;
	const addresses = params.getAll('address');
	const excludes = params.getAll('exclude');
	if (addresses.length !== 1 || !addresses[0].trim() || addresses[0].length > MAX_SHORT_TEXT) {
		return badRequest('Ange en adress på högst 300 tecken.');
	}
	if (excludes.length > 1) return badRequest('Ange högst en recension att utesluta.');

	let excludeId;
	if (excludes.length === 1) {
		const slug = parseRouteSlug(excludes[0]);
		if (!slug) return badRequest('Ogiltig recension att utesluta.');
		const review = await bars.findOne(
			{ $and: [{ slug }, ACTIVE_REVIEW_FILTER] },
			{ projection: { _id: 1 } }
		);
		if (!review) return notFoundProblem('Recensionen hittades inte');
		excludeId = review._id;
	}

	const comparison = await loadNearbyReviewComparison(excludeId);
	if (!comparison.available) {
		return problem(503, 'service_unavailable', 'Jämförelsen kunde inte laddas just nu.');
	}
	return jsonResponse(toApiNearbyReviews(addresses[0], comparison));
});
