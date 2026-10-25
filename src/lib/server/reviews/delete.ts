import { Clock, Effect } from 'effect';
import { audit, type AuditEventInput } from '$lib/server/audit';
import { ConcurrentUpdate, ReviewNotFound, StorageFailed } from '$lib/server/errors';
import { CurrentUser, RequestContext } from '$lib/server/request';
import { PublicReviewViews } from './public-cache';
import { ReviewStore } from './store';

export interface DeleteReviewOptions {
	/** Limits the deletion to the version the caller saw (the API's If-Match, the web form's version). */
	expectedUpdatedAt?: Date;
}

/**
 * Soft-deletes a review for the signed-in user. Like publication, any signed-in user may delete
 * any review. `slug` is the sanitized route slug, or null when it cannot identify a review.
 * The document, image and history stay; every reader stops seeing the review.
 */
export const deleteReview = Effect.fn('deleteReview')(function* (
	slug: string | null,
	options: DeleteReviewOptions = {}
) {
	const { username } = yield* CurrentUser;
	const { ip } = yield* RequestContext;
	const store = yield* ReviewStore;
	const publicViews = yield* PublicReviewViews;
	const auditDelete = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		audit({ eventType: 'review_delete', username, ip, ...event });

	yield* auditDelete({ outcome: 'attempt', targetSlug: slug ?? undefined });
	if (!slug) {
		yield* auditDelete({ outcome: 'failure', reason: 'invalid_slug' });
		return yield* ReviewNotFound.default();
	}

	const now = new Date(yield* Clock.currentTimeMillis);
	const result = yield* store.softDelete(slug, username, now, options.expectedUpdatedAt).pipe(
		Effect.catchTag('MongoError', (error) =>
			Effect.sync(() => console.error('Review delete failed:', error.cause)).pipe(
				Effect.andThen(auditDelete({ outcome: 'failure', targetSlug: slug, reason: 'delete_failed' })),
				Effect.andThen(Effect.fail(new StorageFailed({ message: 'Kunde inte ta bort recensionen' })))
			)
		)
	);
	if (result.outcome === 'not_found') {
		yield* auditDelete({ outcome: 'failure', targetSlug: slug, reason: 'review_not_found' });
		return yield* ReviewNotFound.default();
	}

	const targetId = result.review._id.toString();
	if (result.outcome === 'conflict') {
		yield* auditDelete({
			outcome: 'failure',
			targetSlug: slug,
			targetId,
			reason: 'review_state_changed'
		});
		return yield* ConcurrentUpdate.default();
	}

	yield* publicViews.invalidate;
	yield* auditDelete({ outcome: 'success', targetSlug: slug, targetId });
});
