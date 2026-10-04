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
import type { ReviewEditorContext, EditReviewDependencies } from './write-dependencies';

export const editReview = async (
	data: FormData,
	routeSlug: string,
	context: ReviewEditorContext,
	deps: EditReviewDependencies
): Promise<ReviewWriteResult> => {
	const { username: currentUsername, ip } = context;
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
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', initialFormData);
	}
	if (!existingBar) {
		return reviewFailure(404, 'Recensionen hittades inte', '/', initialFormData);
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
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData);
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
			return reviewFailure(400, 'Sluggen finns redan', '/slug', formData);
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
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData);
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

	try {
		await deps.updateReview(new ObjectId(id), { ...update, changeLog: nextChangeLog });
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
			return reviewFailure(400, 'Sluggen finns redan', '/slug', formData);
		}
		return reviewFailure(400, 'Kunde inte uppdatera recensionen', '/', formData);
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
