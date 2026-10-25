import { ObjectId } from 'mongodb';
import { Clock, Effect } from 'effect';
import type { BarReviewUpdate } from '$lib/types/bar-review';
import { audit, type AuditEventInput } from '$lib/server/audit';
import {
	ConcurrentUpdate,
	DuplicateSlug,
	PreconditionFailed,
	ReviewInvalid,
	ReviewNotFound,
	StorageFailed
} from '$lib/server/errors';
import { ReviewImages } from '$lib/server/review-images';
import { getReviewPublicationStatus } from '$lib/server/review-publication';
import { CurrentUser, RequestContext } from '$lib/server/request';
import { UserStore } from '$lib/server/users';
import { validateReviewAuthors } from './authorship';
import { isDuplicateSlugError } from './errors';
import { toReviewInvalid, validateReviewFormData } from './form';
import { buildReviewChangeLog } from './history';
import { buildReviewPersistenceFields } from './persistence';
import { PublicReviewViews } from './public-cache';
import { ReviewStore } from './store';

const UPDATE_FAILED = 'Kunde inte uppdatera recensionen';
const DUPLICATE_SLUG = 'Sluggen finns redan';

export interface EditReviewOptions {
	/** The version the client saw (the API's `If-Match`); a different stored version is a 412. */
	expectedUpdatedAt?: Date;
}

/**
 * Edits the editable fields of an active review. Collaborative: any signed-in user may edit
 * any review, and the publication status is preserved. The update only matches the version
 * that was read, so a parallel write turns into `ConcurrentUpdate` and removes a newly
 * uploaded replacement image.
 */
export const editReview = Effect.fn('editReview')(function* (
	data: FormData,
	routeSlug: string,
	options: EditReviewOptions = {}
) {
	const { username } = yield* CurrentUser;
	const { ip } = yield* RequestContext;
	const store = yield* ReviewStore;
	const users = yield* UserStore;
	const images = yield* ReviewImages;
	const publicViews = yield* PublicReviewViews;

	const id = data.get('id');
	if (typeof id !== 'string' || !ObjectId.isValid(id)) {
		return yield* new ReviewInvalid({ message: 'Ogiltiga formulärdata', pointer: '/' });
	}
	const reviewId = new ObjectId(id);
	const auditEdit = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip' | 'targetId'>) =>
		audit({ eventType: 'review_edit', username, ip, targetId: id, ...event });
	const storageFailure = (label: string, reason: string, targetSlug: string) => (cause: unknown) =>
		Effect.sync(() => console.error(label, cause)).pipe(
			Effect.andThen(auditEdit({ outcome: 'failure', targetSlug, reason })),
			Effect.andThen(Effect.fail(new StorageFailed({ message: UPDATE_FAILED })))
		);

	const existing = yield* store
		.findActiveById(reviewId)
		.pipe(
			Effect.catchTag('MongoError', (error) =>
				storageFailure('Review lookup failed:', 'review_lookup_failed', routeSlug)(error.cause)
			)
		);
	if (!existing) return yield* ReviewNotFound.default();

	if (existing.slug !== routeSlug) {
		yield* auditEdit({ outcome: 'denied', targetSlug: routeSlug, reason: 'route_slug_mismatch' });
		return yield* new ReviewInvalid({ message: 'Ogiltiga formulärdata', pointer: '/' });
	}

	if (
		options.expectedUpdatedAt &&
		new Date(existing.updatedAt).getTime() !== options.expectedUpdatedAt.getTime()
	) {
		yield* auditEdit({ outcome: 'failure', targetSlug: routeSlug, reason: 'stale_precondition' });
		return yield* PreconditionFailed.default();
	}

	const validation = validateReviewFormData(data);
	if (!validation.ok) return yield* toReviewInvalid(validation.problem);
	const fields = buildReviewPersistenceFields(validation.formData, username, existing);

	yield* validateReviewAuthors(validation.formData.authors, users.existingUsernames, existing).pipe(
		Effect.catchTag('MongoError', (error) =>
			storageFailure('Author validation failed:', 'author_validation_failed', fields.slug)(
				error.cause
			)
		)
	);

	const conflict = yield* store
		.findSlugConflict(fields.slug, reviewId)
		.pipe(
			Effect.catchTag('MongoError', (error) =>
				storageFailure('Slug check failed:', 'slug_check_failed', fields.slug)(error.cause)
			)
		);
	if (conflict) {
		yield* auditEdit({ outcome: 'failure', targetSlug: fields.slug, reason: 'duplicate_slug' });
		return yield* new DuplicateSlug({ message: DUPLICATE_SLUG, pointer: '/slug' });
	}

	const now = new Date(yield* Clock.currentTimeMillis);
	yield* Effect.scoped(
		Effect.gen(function* () {
			const upload = yield* images.upload(data.get('image'), {
				required: false,
				writeFailureMessage: UPDATE_FAILED
			});
			const update: BarReviewUpdate = { ...fields, updatedAt: now };
			if (upload) update.image = upload.filename;
			const changeLog = buildReviewChangeLog(
				existing,
				{ ...fields, image: upload?.filename },
				now,
				username
			);

			// Failing inside this scope removes the replacement image again.
			const { matchedCount } = yield* store
				.updateIfUnchanged(reviewId, { ...update, changeLog }, existing.updatedAt)
				.pipe(
					Effect.catchTag('MongoError', (error) => {
						const duplicate = isDuplicateSlugError(error.cause);
						return Effect.sync(() => console.error('Update failed:', error.cause)).pipe(
							Effect.andThen(
								auditEdit({
									outcome: 'failure',
									targetSlug: fields.slug,
									reason: duplicate ? 'duplicate_slug_update' : 'update_failed'
								})
							),
							Effect.andThen(
								Effect.fail(
									duplicate
										? new DuplicateSlug({ message: DUPLICATE_SLUG, pointer: '/slug' })
										: new StorageFailed({ message: UPDATE_FAILED })
								)
							)
						);
					})
				);
			if (matchedCount === 0) {
				yield* auditEdit({
					outcome: 'failure',
					targetSlug: fields.slug,
					reason: 'concurrent_update'
				});
				return yield* ConcurrentUpdate.default();
			}
		})
	);

	if (getReviewPublicationStatus(existing) === 'published') yield* publicViews.invalidate;
	yield* auditEdit({ outcome: 'success', targetSlug: fields.slug });
	return { slug: fields.slug };
});
