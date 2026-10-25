import { ObjectId } from 'mongodb';
import { Clock, Effect } from 'effect';
import { REVIEW_RATING_FIELD_NAMES } from '$lib/review-metadata';
import { audit } from '$lib/server/audit';
import { DuplicateSlug, ReviewInvalid, StorageFailed } from '$lib/server/errors';
import { ReviewImages } from '$lib/server/review-images';
import { CurrentUser, RequestContext } from '$lib/server/request';
import { UserStore } from '$lib/server/users';
import { validateReviewAuthors } from './authorship';
import { isDuplicateSlugError } from './errors';
import { toReviewInvalid, validateReviewFormData } from './form';
import { buildReviewPersistenceFields } from './persistence';
import { ReviewStore } from './store';

const CREATE_FAILED = 'Kunde inte skapa recensionen';
const DUPLICATE_SLUG = 'En bar med den här sluggen finns redan';

/**
 * Creates a fully validated draft for the signed-in user. Shared by the web form and
 * `POST /api/v1/reviews`; both doors pass the same form fields. The image is written only
 * after every cheaper check passed, and is removed again if the insert fails.
 */
export const createDraftReview = Effect.fn('createDraftReview')(function* (data: FormData) {
	const { username } = yield* CurrentUser;
	const { ip } = yield* RequestContext;
	const store = yield* ReviewStore;
	const users = yield* UserStore;
	const images = yield* ReviewImages;
	const auditFailure = (reason: string, targetSlug?: string) =>
		audit({ eventType: 'review_create', outcome: 'failure', username, ip, targetSlug, reason });
	const storageFailure = (label: string, reason: string, targetSlug?: string) => (cause: unknown) =>
		Effect.sync(() => console.error(label, cause)).pipe(
			Effect.andThen(auditFailure(reason, targetSlug)),
			Effect.andThen(Effect.fail(new StorageFailed({ message: CREATE_FAILED })))
		);

	const validation = validateReviewFormData(data, {
		invalidRatingMessage: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
		ratingValidationPosition: 'beforeDetails'
	});
	if (!validation.ok) {
		if (validation.problem.pointer === '/bar-name') yield* auditFailure('invalid_bar_name');
		return yield* toReviewInvalid(validation.problem);
	}
	const fields = buildReviewPersistenceFields(validation.formData, username);

	yield* validateReviewAuthors(validation.formData.authors, users.existingUsernames).pipe(
		Effect.catchTag('MongoError', (error) =>
			storageFailure('Author validation failed:', 'author_validation_failed')(error.cause)
		)
	);

	// Prevent a slug collision before writing the image file.
	const conflict = yield* store
		.findSlugConflict(fields.slug)
		.pipe(
			Effect.catchTag('MongoError', (error) =>
				storageFailure('Slug check failed:', 'slug_check_failed')(error.cause)
			)
		);
	if (conflict) {
		yield* auditFailure('duplicate_slug', fields.slug);
		return yield* new DuplicateSlug({ message: DUPLICATE_SLUG, pointer: '/slug' });
	}

	yield* Effect.scoped(
		Effect.gen(function* () {
			const upload = yield* images.upload(data.get('image'), {
				required: true,
				writeFailureMessage: 'Kunde inte ladda upp bilden'
			});
			if (!upload) return yield* new ReviewInvalid({ message: 'Ogiltig fil', pointer: '/image' });

			const now = new Date(yield* Clock.currentTimeMillis);
			// A failed insert closes the scope with a failure, which removes the new image.
			yield* store
				.insert({
					_id: new ObjectId(),
					...fields,
					image: upload.filename,
					publicationStatus: 'draft',
					changeLog: [],
					createdAt: now,
					updatedAt: now
				})
				.pipe(
					Effect.catchTag('MongoError', (error) => {
						const duplicate = isDuplicateSlugError(error.cause);
						return Effect.sync(() => console.error('Insert failed:', error.cause)).pipe(
							Effect.andThen(
								auditFailure(duplicate ? 'duplicate_slug_insert' : 'insert_failed', fields.slug)
							),
							Effect.andThen(
								Effect.fail(
									duplicate
										? new DuplicateSlug({ message: DUPLICATE_SLUG, pointer: '/slug' })
										: new StorageFailed({ message: CREATE_FAILED })
								)
							)
						);
					})
				);
		})
	);

	yield* audit({
		eventType: 'review_create',
		outcome: 'success',
		username,
		ip,
		targetSlug: fields.slug
	});
	return { slug: fields.slug };
});
