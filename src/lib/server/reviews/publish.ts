import { Clock, Effect } from 'effect';
import { audit, type AuditEventInput } from '$lib/server/audit';
import {
	AlreadyPublished,
	ConcurrentUpdate,
	ReviewNotFound,
	StorageFailed
} from '$lib/server/errors';
import { CurrentUser, RequestContext } from '$lib/server/request';
import { PublicReviewViews } from './public-cache';
import { ReviewStore } from './store';

/**
 * Publishes a draft for the signed-in user. One-way; the credited authors are kept and the
 * publisher is recorded in the change log. `slug` is the sanitized route slug, or null when
 * the route parameter cannot identify a review.
 */
export const publishReview = Effect.fn('publishReview')(function* (slug: string | null) {
	const { username } = yield* CurrentUser;
	const { ip } = yield* RequestContext;
	const store = yield* ReviewStore;
	const publicViews = yield* PublicReviewViews;
	const auditPublish = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		audit({ eventType: 'review_publish', username, ip, ...event });

	yield* auditPublish({ outcome: 'attempt', targetSlug: slug ?? undefined });
	if (!slug) {
		yield* auditPublish({ outcome: 'failure', reason: 'invalid_slug' });
		return yield* ReviewNotFound.default();
	}

	const now = new Date(yield* Clock.currentTimeMillis);
	const result = yield* store
		.publishDraft(slug, username, now)
		.pipe(
			Effect.catchTag('MongoError', (error) =>
				Effect.sync(() => console.error('Review publish failed:', error.cause)).pipe(
					Effect.andThen(
						auditPublish({ outcome: 'failure', targetSlug: slug, reason: 'publish_failed' })
					),
					Effect.andThen(
						Effect.fail(new StorageFailed({ message: 'Kunde inte publicera recensionen' }))
					)
				)
			)
		);
	if (result.outcome === 'not_found') {
		yield* auditPublish({ outcome: 'failure', targetSlug: slug, reason: 'review_not_found' });
		return yield* ReviewNotFound.default();
	}

	const targetId = result.review._id.toString();
	if (result.outcome === 'already_published') {
		yield* auditPublish({
			outcome: 'failure',
			targetSlug: slug,
			targetId,
			reason: 'already_published'
		});
		return yield* new AlreadyPublished({ message: 'Recensionen är redan publicerad' });
	}
	if (result.outcome === 'conflict') {
		yield* auditPublish({
			outcome: 'failure',
			targetSlug: slug,
			targetId,
			reason: 'publication_state_changed'
		});
		return yield* ConcurrentUpdate.default();
	}

	yield* publicViews.invalidate;
	yield* auditPublish({ outcome: 'success', targetSlug: slug, targetId });
	return { slug };
});
