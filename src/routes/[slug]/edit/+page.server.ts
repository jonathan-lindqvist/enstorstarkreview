import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import type { BarReviewUpdate } from '$lib/types/bar-review';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { cleanupReviewImageUpload, uploadReviewImage } from '$lib/server/review-images';
import {
	MAX_SLUG_LENGTH,
	buildEditedReviewAuthorship,
	buildReviewFormData,
	buildReviewChangeLog,
	buildReviewPersistenceFields,
	failReviewForm,
	failReviewFormProblem,
	isDuplicateSlugError,
	sanitizeSlug,
	validateEditedReviewFormData,
	validateReviewCoAuthors
} from '$lib/server/review-form';
import { getReviewPublicationStatus } from '$lib/server/review-publication';

export const load: PageServerLoad = async (event) => {
	const { params, locals } = event;
	const ip = getRequestIp(event);

	if (!locals.user) {
		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'denied',
			ip,
			reason: 'unauthenticated_edit_page_access'
		});
		throw redirect(302, '/login');
	}

	// Decode the slug to handle Swedish characters (åäö) and other Unicode
	const decodedSlug = decodeURIComponent(params.slug);
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404, 'Hittades inte');
	}

	const bar = await bars.findOne({ slug: safeSlug });
	if (!bar) throw error(404, 'Hittades inte');

	const allUsers = await users.find().toArray();
	const serializedUsers = allUsers.map((user) => ({
		_id: user._id.toString(),
		username: user.username
	}));

	return {
		bar: {
			...bar,
			_id: bar._id.toString(),
			publicationStatus: getReviewPublicationStatus(bar)
		},
		currentUsername: locals.user.username,
		availableUsers: serializedUsers
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, params } = event;
		const ip = getRequestIp(event);

		if (!locals.user) {
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'denied',
				ip,
				reason: 'unauthenticated_edit_action'
			});
			return failReviewForm(401, 'Du är inte inloggad');
		}
		const currentUsername = locals.user.username;

		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'attempt',
			username: currentUsername,
			ip
		});

		const decodedSlug = decodeURIComponent(params.slug);
		const routeSlug = sanitizeSlug(decodedSlug);
		if (!routeSlug.length || routeSlug.length > MAX_SLUG_LENGTH) {
			return failReviewForm(400, 'Ogiltig slug', '/slug');
		}

		let data: FormData;
		try {
			data = await request.formData();
		} catch (err) {
			console.error('Review form parse failed:', err);
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: routeSlug,
				reason: 'form_parse_failed'
			});
			return failReviewForm(
				400,
				'Kunde inte läsa formuläret. Kontrollera uppladdningen och försök igen.'
			);
		}

		const id = data.get('id');
		const initialFormData = buildReviewFormData(data, currentUsername);

		if (typeof id !== 'string' || !ObjectId.isValid(id)) {
			return failReviewForm(400, 'Ogiltiga formulärdata', '/', initialFormData);
		}

		let existingBar;
		try {
			existingBar = await bars.findOne({ _id: new ObjectId(id) });
		} catch (err) {
			console.error('Review lookup failed:', err);
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: routeSlug,
				targetId: id,
				reason: 'review_lookup_failed'
			});
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', initialFormData);
		}
		if (!existingBar) {
			return failReviewForm(404, 'Recensionen hittades inte', '/', initialFormData);
		}

		if (existingBar.slug !== routeSlug) {
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'denied',
				username: currentUsername,
				ip,
				targetSlug: routeSlug,
				targetId: id,
				reason: 'route_slug_mismatch'
			});
			return failReviewForm(400, 'Ogiltiga formulärdata', '/', initialFormData);
		}

		const validation = validateEditedReviewFormData(data, existingBar.author, currentUsername);
		const formData = validation.formData;

		if (!validation.ok) {
			return failReviewFormProblem(validation.problem, formData);
		}

		const authorshipFields = buildEditedReviewAuthorship(
			existingBar.author,
			currentUsername,
			formData.coAuthors
		);
		const reviewFields = {
			...buildReviewPersistenceFields({
				...formData,
				coAuthors: authorshipFields.coAuthors
			}),
			author: authorshipFields.author
		};

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
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: reviewFields.slug,
				targetId: id,
				reason: 'coauthor_validation_failed'
			});
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}

		try {
			const existing = await bars.findOne({
				slug: reviewFields.slug,
				_id: { $ne: new ObjectId(id) }
			});

			if (existing) {
				await logAuditEvent({
					eventType: 'review_edit',
					outcome: 'failure',
					username: currentUsername,
					ip,
					targetSlug: reviewFields.slug,
					targetId: id,
					reason: 'duplicate_slug'
				});
				return failReviewForm(400, 'Sluggen finns redan', '/slug', formData);
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: reviewFields.slug,
				targetId: id,
				reason: 'slug_check_failed'
			});
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}

		const now = new Date();

		const update: BarReviewUpdate = {
			...reviewFields,
			updatedAt: now
		};

		const imageUpload = await uploadReviewImage(data.get('image'), {
			required: false,
			writeFailureMessage: 'Kunde inte uppdatera recensionen'
		});

		if (!imageUpload.ok) {
			return failReviewFormProblem(imageUpload.problem, formData);
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
			await bars.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { ...update, changeLog: nextChangeLog } }
			);
		} catch (err) {
			console.error('Update failed:', err);
			await logAuditEvent({
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: reviewFields.slug,
				targetId: id,
				reason: isDuplicateSlugError(err) ? 'duplicate_slug_update' : 'update_failed'
			});
			cleanupReviewImageUpload(imageUpload.upload);

			if (isDuplicateSlugError(err)) {
				return failReviewForm(400, 'Sluggen finns redan', '/slug', formData);
			}
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}

		await logAuditEvent({
			eventType: 'review_edit',
			outcome: 'success',
			username: currentUsername,
			ip,
			targetSlug: reviewFields.slug,
			targetId: id
		});

		throw redirect(303, `/${encodeURIComponent(reviewFields.slug)}`);
	}
};
