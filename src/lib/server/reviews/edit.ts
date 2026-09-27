import { ObjectId } from 'mongodb';
import { buildReviewPersistenceFields } from './persistence';
import { validateReviewAuthors } from './authorship';
import { validateReviewFormData } from './form';
import { isDuplicateSlugError } from './errors';
import { reviewFailure, reviewProblem, type ReviewWriteResult } from './workflow-result';
import type { BarReviewUpdate } from '$lib/types/bar-review';
import { buildReviewFormData } from './form';
import { buildReviewChangeLog } from './history';
import { getReviewPublicationStatus } from '$lib/server/review-publication';
import type { EditReviewContext, EditReviewDependencies } from './write-dependencies';

const CONCURRENT_UPDATE_MESSAGE = 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.';

export const editReview = async (
	data: FormData,
	routeSlug: string,
	context: EditReviewContext,
	deps: EditReviewDependencies
): Promise<ReviewWriteResult> => {
	const { username: currentUsername, ip, expectedUpdatedAt } = context;
	const id = data.get('id');
	const initialFormData = buildReviewFormData(data);

	if (typeof id !== 'string' || !ObjectId.isValid(id)) {
		return reviewFailure(400, 'Ogiltiga formulärdata', '/', initialFormData);
	}

	let existingBar;
	try {
		existingBar = await deps.findReview(new ObjectId(id));
	} catch (err) {
		console.error('Review lookup failed:', err);
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: routeSlug,
			targetId: id,
			reason: 'review_lookup_failed'
		});
		return reviewFailure(
			400,
			'Kunde inte uppdatera recensionen',
			'/',
			initialFormData,
			'storage_failed'
		);
	}
	if (!existingBar) {
		return reviewFailure(404, 'Recensionen hittades inte', '/', initialFormData, 'not_found');
	}

	if (existingBar.slug !== routeSlug) {
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'denied',
			username: currentUsername,
			ip,
			targetSlug: routeSlug,
			targetId: id,
			reason: 'route_slug_mismatch'
		});
		return reviewFailure(400, 'Ogiltiga formulärdata', '/', initialFormData);
	}

	if (
		expectedUpdatedAt &&
		new Date(existingBar.updatedAt).getTime() !== expectedUpdatedAt.getTime()
	) {
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: routeSlug,
			targetId: id,
			reason: 'stale_precondition'
		});
		return reviewFailure(
			412,
			CONCURRENT_UPDATE_MESSAGE,
			'/',
			initialFormData,
			'precondition_failed'
		);
	}

	const validation = validateReviewFormData(data);
	const formData = validation.formData;

	if (!validation.ok) {
		return reviewProblem(validation.problem, formData);
	}

	const reviewFields = buildReviewPersistenceFields(formData, currentUsername, existingBar);

	try {
		const authorProblem = await validateReviewAuthors(
			formData.authors,
			deps.loadValidUsernames,
			existingBar
		);

		if (authorProblem) {
			return reviewProblem(authorProblem, formData);
		}
	} catch (err) {
		console.error('Author validation failed:', err);
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: reviewFields.slug,
			targetId: id,
			reason: 'author_validation_failed'
		});
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData, 'storage_failed');
	}

	try {
		const existing = await deps.findSlugConflict(reviewFields.slug, new ObjectId(id));

		if (existing) {
			await deps.audit({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: reviewFields.slug,
				targetId: id,
				reason: 'duplicate_slug'
			});
			return reviewFailure(400, 'Sluggen finns redan', '/slug', formData, 'duplicate_slug');
		}
	} catch (err) {
		console.error('Slug check failed:', err);
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: reviewFields.slug,
			targetId: id,
			reason: 'slug_check_failed'
		});
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData, 'storage_failed');
	}

	const now = deps.now();

	const update: BarReviewUpdate = {
		...reviewFields,
		updatedAt: now
	};

	const imageUpload = await deps.uploadImage(data.get('image'), {
		required: false,
		writeFailureMessage: 'Kunde inte uppdatera recensionen'
	});

	if (!imageUpload.ok) {
		return reviewProblem(imageUpload.problem, formData);
	}

	if (imageUpload.upload) {
		update.image = imageUpload.upload.filename;
	}

	const nextChangeLog = buildReviewChangeLog(
		existingBar,
		{ ...reviewFields, image: imageUpload.upload?.filename },
		now,
		currentUsername
	);

	let matchedCount: number;
	try {
		// The update matches only the version that was read, so parallel edits cannot be lost.
		({ matchedCount } = await deps.updateReview(
			new ObjectId(id),
			{ ...update, changeLog: nextChangeLog },
			existingBar.updatedAt
		));
	} catch (err) {
		console.error('Update failed:', err);
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: reviewFields.slug,
			targetId: id,
			reason: isDuplicateSlugError(err) ? 'duplicate_slug_update' : 'update_failed'
		});
		deps.cleanupImage(imageUpload.upload);

		if (isDuplicateSlugError(err)) {
			return reviewFailure(400, 'Sluggen finns redan', '/slug', formData, 'duplicate_slug');
		}
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData, 'storage_failed');
	}

	if (matchedCount === 0) {
		await deps.audit({
			eventType: 'review_edit',
			outcome: 'failure',
			username: currentUsername,
			ip,
			targetSlug: reviewFields.slug,
			targetId: id,
			reason: 'concurrent_update'
		});
		deps.cleanupImage(imageUpload.upload);
		return reviewFailure(409, CONCURRENT_UPDATE_MESSAGE, '/', formData, 'concurrent_update');
	}

	if (getReviewPublicationStatus(existingBar) === 'published') {
		deps.invalidatePublicViews();
	}

	await deps.audit({
		eventType: 'review_edit',
		outcome: 'success',
		username: currentUsername,
		ip,
		targetSlug: reviewFields.slug,
		targetId: id
	});
	return { ok: true, slug: reviewFields.slug };
};
