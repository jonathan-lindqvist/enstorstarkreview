import { bars } from '$lib/db/bars';
import {
	apiHandler,
	cachedJsonResponse,
	jsonResponse,
	readJsonBody,
	requireUser
} from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { internalErrorProblem } from '$lib/server/api/problem';
import { reviewProblemResponse, toReviewFormData } from '$lib/server/api/review-input';
import { reviewETag, reviewPath, toApiReview } from '$lib/server/api/reviews';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { withReviewVisibility } from '$lib/server/review-publication';
import { createDraftReview } from '$lib/server/reviews/create';
import { buildReviewSearchFilter, sanitizeReviewSearch } from '$lib/server/reviews/listing';
import { createReviewDependencies } from '$lib/server/reviews/production';
import { normalizeReviewSort, sortReviews } from '$lib/utils/review-sort';

export const GET = apiHandler(async (event) => {
	const search = sanitizeReviewSearch(event.url.searchParams.get('search'));
	const sort = normalizeReviewSort(event.url.searchParams.get('sort'));

	const reviews = await bars
		.find(withReviewVisibility(buildReviewSearchFilter(search), Boolean(event.locals.user)))
		.toArray();
	const sorted = sortReviews(reviews, sort, (review) => ({
		id: review._id.toString(),
		createdAt: review.createdAt,
		rating: review.rating
	}));

	const body: ApiSchemas['ReviewList'] = { reviews: sorted.map(toApiReview) };
	return cachedJsonResponse(event, body);
});

export const POST = apiHandler(async (event) => {
	const ip = getRequestIp(event);
	const user = requireUser(event);
	if (user instanceof Response) {
		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'denied',
			ip,
			reason: 'unauthenticated_api_create'
		});
		return user;
	}

	await logAuditEvent({
		eventType: 'review_create',
		outcome: 'attempt',
		username: user.username,
		ip
	});

	const body = await readJsonBody(event.request, 'ReviewCreateRequest');
	if (!body.ok) return body.response;

	const form = toReviewFormData(body.value);
	if (!form.ok) return form.response;

	const result = await createDraftReview(
		form.data,
		{ username: user.username, ip },
		createReviewDependencies
	);
	if (!result.ok) return reviewProblemResponse(result.problem);

	const review = await bars.findOne({ slug: result.slug });
	if (!review) return internalErrorProblem();

	return jsonResponse(toApiReview(review), {
		status: 201,
		headers: { location: reviewPath(review.slug), etag: reviewETag(review) }
	});
});
