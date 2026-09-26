import { bars } from '$lib/db/bars';
import { apiHandler, jsonResponse, requireUser } from '$lib/server/api/http';
import { internalErrorProblem, problem } from '$lib/server/api/problem';
import { reviewETag, toApiReview } from '$lib/server/api/reviews';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { publishReviewDependencies } from '$lib/server/reviews/production';
import { publishReview } from '$lib/server/reviews/publish';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';

export const POST = apiHandler(async (event) => {
	const ip = getRequestIp(event);
	const slug = parseRouteSlug(event.params.slug ?? '');
	const user = requireUser(event);
	if (user instanceof Response) {
		await logAuditEvent({
			eventType: 'review_publish',
			outcome: 'denied',
			ip,
			targetSlug: slug ?? undefined,
			reason: 'unauthenticated_api_publish'
		});
		return user;
	}

	const result = await publishReview(
		slug,
		{ username: user.username, ip },
		publishReviewDependencies
	);
	if (!result.ok) {
		return result.code === 'storage_failed'
			? internalErrorProblem()
			: problem(result.status, result.code, result.message);
	}

	const review = await bars.findOne({ slug: result.slug });
	if (!review) return internalErrorProblem();

	return jsonResponse(toApiReview(review), { headers: { etag: reviewETag(review) } });
});
