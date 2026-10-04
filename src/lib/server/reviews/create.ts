import { ObjectId } from 'mongodb';
import { buildReviewPersistenceFields } from './persistence';
import { validateReviewAuthors } from './authorship';
import { validateReviewFormData } from './form';
import { isDuplicateSlugError } from './errors';
import { reviewFailure, reviewProblem, type ReviewWriteResult } from './workflow-result';
import { REVIEW_RATING_FIELD_NAMES } from '$lib/review-metadata';
import type { ReviewEditorContext, CreateReviewDependencies } from './write-dependencies';

export const createDraftReview = async (
	data: FormData,
	context: ReviewEditorContext,
	deps: CreateReviewDependencies
): Promise<ReviewWriteResult> => {
	const { username, ip } = context;
	const validation = validateReviewFormData(data, {
		invalidRatingMessage: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
		ratingValidationPosition: 'beforeDetails'
	});
	const formData = validation.formData;

	if (!validation.ok) {
		if (validation.problem.pointer === '/bar-name') {
			await deps.audit({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'invalid_bar_name'
			});
		}
		return reviewProblem(validation.problem, formData);
	}

	const reviewFields = buildReviewPersistenceFields(formData, username);

	try {
		const authorProblem = await validateReviewAuthors(formData.authors, deps.loadValidUsernames);

		if (authorProblem) {
			return reviewProblem(authorProblem, formData);
		}
	} catch (err) {
		console.error('Author validation failed:', err);
		await deps.audit({
			eventType: 'review_create',
			outcome: 'failure',
			username,
			ip,
			reason: 'author_validation_failed'
		});
		return reviewFailure(400, 'Kunde inte skapa recensionen', '/', formData);
	}

	// prevent slug collision before we write the image file
	try {
		const existing = await deps.findSlugConflict(reviewFields.slug);
		if (existing) {
			await deps.audit({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				targetSlug: reviewFields.slug,
				reason: 'duplicate_slug'
			});
			return reviewFailure(400, 'En bar med den här sluggen finns redan', '/slug', formData);
		}
	} catch (err) {
		console.error('Slug check failed:', err);
		await deps.audit({
			eventType: 'review_create',
			outcome: 'failure',
			username,
			ip,
			reason: 'slug_check_failed'
		});
		return reviewFailure(400, 'Kunde inte skapa recensionen', '/', formData);
	}

	const imageUpload = await deps.uploadImage(data.get('image'), {
		required: true,
		writeFailureMessage: 'Kunde inte ladda upp bilden'
	});

	if (!imageUpload.ok) {
		return reviewProblem(imageUpload.problem, formData);
	}

	if (!imageUpload.upload) {
		return reviewFailure(400, 'Ogiltig fil', '/image', formData);
	}

	const now = deps.now();

	try {
		await deps.insertReview({
			_id: new ObjectId(),
			...reviewFields,
			image: imageUpload.upload.filename,
			publicationStatus: 'draft',
			changeLog: [],
			createdAt: now,
			updatedAt: now
		});
	} catch (err) {
		console.error('Insert failed:', err);
		await deps.audit({
			eventType: 'review_create',
			outcome: 'failure',
			username,
			ip,
			targetSlug: reviewFields.slug,
			reason: isDuplicateSlugError(err) ? 'duplicate_slug_insert' : 'insert_failed'
		});
		deps.cleanupImage(imageUpload.upload);

		if (isDuplicateSlugError(err)) {
			return reviewFailure(400, 'En bar med den här sluggen finns redan', '/slug', formData);
		}
		return reviewFailure(400, 'Kunde inte skapa recensionen', '/', formData);
	}

	await deps.audit({
		eventType: 'review_create',
		outcome: 'success',
		username,
		ip,
		targetSlug: reviewFields.slug
	});

	return { ok: true, slug: reviewFields.slug };
};
