import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { cleanupReviewImageUpload, uploadReviewImage } from '$lib/server/review-images';
import {
	REVIEW_RATING_FIELD_NAMES,
	buildReviewPersistenceFields,
	failReviewForm,
	failReviewFormProblem,
	isDuplicateSlugError,
	validateReviewCoAuthors,
	validateReviewFormData
} from '$lib/server/review-form';

export const load: PageServerLoad = async (event) => {
	const { locals } = event;
	if (!locals.user) {
		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'denied',
			ip: getRequestIp(event),
			reason: 'unauthenticated_create_page_access'
		});
		throw redirect(302, '/login');
	}

	const allUsers = await users.find().toArray();
	const serializedUsers = allUsers.map((user) => ({
		_id: user._id.toString(),
		username: user.username
	}));

	return {
		username: locals.user.username,
		availableUsers: serializedUsers
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		const ip = getRequestIp(event);
		const username = locals.user?.username ?? null;

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'denied',
				ip,
				reason: 'unauthenticated_create_action'
			});
			return failReviewForm(401, 'Du är inte inloggad');
		}

		const currentUsername = locals.user.username;

		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'attempt',
			username,
			ip
		});

		let data: FormData;
		try {
			data = await request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'form_parse_failed'
			});
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const validation = validateReviewFormData(data, currentUsername, {
			invalidRatingMessage: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
			ratingValidationPosition: 'beforeDetails'
		});
		const formData = validation.formData;

		if (!validation.ok) {
			if (validation.problem.pointer === '/bar-name') {
				await logAuditEvent({
					eventType: 'review_create',
					outcome: 'failure',
					username,
					ip,
					reason: 'invalid_bar_name'
				});
			}
			return failReviewFormProblem(validation.problem, formData);
		}

		const reviewFields = buildReviewPersistenceFields(formData);

		try {
			const coAuthorProblem = await validateReviewCoAuthors(
				reviewFields.coAuthors,
				async (coAuthors) =>
					(
						await users
							.find({ username: { $in: coAuthors } }, { projection: { username: 1 } })
							.toArray()
					).map((user) => user.username)
			);

			if (coAuthorProblem) {
				return failReviewFormProblem(coAuthorProblem, formData);
			}
		} catch (err) {
			console.error('Co-author validation failed:', err);
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'coauthor_validation_failed'
			});
			return failReviewForm(400, 'Kunde inte skapa recensionen', '/', formData);
		}

		// prevent slug collision before we write the image file
		try {
			const existing = await bars.findOne({ slug: reviewFields.slug });
			if (existing) {
				await logAuditEvent({
					eventType: 'review_create',
					outcome: 'failure',
					username,
					ip,
					targetSlug: reviewFields.slug,
					reason: 'duplicate_slug'
				});
				return failReviewForm(400, 'En bar med den här sluggen finns redan', '/slug', formData);
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'slug_check_failed'
			});
			return failReviewForm(400, 'Kunde inte skapa recensionen', '/', formData);
		}

		const imageUpload = await uploadReviewImage(data.get('image'), {
			required: true,
			writeFailureMessage: 'Kunde inte ladda upp bilden'
		});

		if (!imageUpload.ok) {
			return failReviewFormProblem(imageUpload.problem, formData);
		}

		if (!imageUpload.upload) {
			return failReviewForm(400, 'Ogiltig fil', '/image', formData);
		}

		const now = new Date();

		// insert
		try {
			await bars.insertOne({
				_id: new ObjectId(),
				...reviewFields,
				image: imageUpload.upload.filename,
				author: currentUsername,
				publicationStatus: 'draft',
				changeLog: [],
				createdAt: now,
				updatedAt: now
			});
		} catch (err) {
			console.error('Insert failed:', err);
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				targetSlug: reviewFields.slug,
				reason: isDuplicateSlugError(err) ? 'duplicate_slug_insert' : 'insert_failed'
			});
			cleanupReviewImageUpload(imageUpload.upload);

			if (isDuplicateSlugError(err)) {
				return failReviewForm(400, 'En bar med den här sluggen finns redan', '/slug', formData);
			}
			return failReviewForm(400, 'Kunde inte skapa recensionen', '/', formData);
		}

		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'success',
			username,
			ip,
			targetSlug: reviewFields.slug
		});

		// must THROW redirect
		throw redirect(303, `/${encodeURIComponent(reviewFields.slug)}`);
	}
};
