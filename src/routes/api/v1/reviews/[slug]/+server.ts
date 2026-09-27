import { bars } from '$lib/db/bars';
import {
	apiHandler,
	cachedJsonResponse,
	etagMatches,
	jsonResponse,
	readJsonBody,
	requireUser
} from '$lib/server/api/http';
import { internalErrorProblem, notFoundProblem, problem } from '$lib/server/api/problem';
import { reviewProblemResponse, toReviewFormData } from '$lib/server/api/review-input';
import { reviewETag, toApiReview } from '$lib/server/api/reviews';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { withReviewVisibility } from '$lib/server/review-publication';
import { editReview } from '$lib/server/reviews/edit';
import { editReviewDependencies } from '$lib/server/reviews/production';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';

const STALE_MESSAGE = 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.';

export const GET = apiHandler(async (event) => {
	const slug = parseRouteSlug(event.params.slug ?? '');
	if (!slug) return notFoundProblem('Recensionen hittades inte');

	const review = await bars.findOne(withReviewVisibility({ slug }, Boolean(event.locals.user)));
	if (!review) return notFoundProblem('Recensionen hittades inte');

	return cachedJsonResponse(event, toApiReview(review), { etag: reviewETag(review) });
});

export const PUT = apiHandler(async (event) => {
	const ip = getRequestIp(event);
	const user = requireUser(event);
	if (user instanceof Response) {
		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'denied',
			ip,
			reason: 'unauthenticated_api_edit'
		});
		return user;
	}

	await logAuditEvent({
		eventType: 'review_edit',
		outcome: 'attempt',
		username: user.username,
		ip
	});

	const slug = parseRouteSlug(event.params.slug ?? '');
	if (!slug) return notFoundProblem('Recensionen hittades inte');

	const ifMatch = event.request.headers.get('if-match');
	if (!ifMatch) {
		return problem(
			428,
			'precondition_required',
			'Ange versionen av recensionen (If-Match) för att ändra den.'
		);
	}

	const body = await readJsonBody(event.request, 'ReviewUpdateRequest');
	if (!body.ok) return body.response;

	const existing = await bars.findOne({ slug });
	if (!existing) return notFoundProblem('Recensionen hittades inte');
	if (!etagMatches(ifMatch, reviewETag(existing))) {
		return problem(412, 'precondition_failed', STALE_MESSAGE);
	}

	const form = toReviewFormData(body.value, { id: existing._id.toHexString() });
	if (!form.ok) return form.response;

	const result = await editReview(
		form.data,
		slug,
		{ username: user.username, ip, expectedUpdatedAt: new Date(existing.updatedAt) },
		editReviewDependencies
	);
	if (!result.ok) return reviewProblemResponse(result.problem);

	const review = await bars.findOne({ slug: result.slug });
	if (!review) return internalErrorProblem();

	return jsonResponse(toApiReview(review), { headers: { etag: reviewETag(review) } });
});
