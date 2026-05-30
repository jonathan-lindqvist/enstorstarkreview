import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { unlinkSync, writeFileSync } from 'fs';
import { REVIEW_IMAGE_ALLOWED_TYPES_LABEL, REVIEW_IMAGE_TOO_LARGE_MESSAGE } from '$lib/constants';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { getReviewImageUploadPath } from '$lib/server/review-images';
import {
	MAX_COAUTHORS,
	MAX_IMAGE_SIZE,
	MAX_LONG_TEXT,
	MAX_SHORT_TEXT,
	MAX_SLUG_LENGTH,
	REVIEW_RATING_FIELD_NAMES,
	buildReviewFormData,
	failReviewForm,
	getImageExtension,
	getReviewRatingValues,
	hasInvalidOverallRating,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	matchesImageSignature,
	sanitizeReviewImage
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

		const formData = buildReviewFormData(data, currentUsername);
		const {
			barName: safeBarName,
			description: safeDescription,
			atmosphere,
			service,
			selection,
			quality,
			price,
			cleanliness,
			soundLevel,
			barhopPotential,
			rating,
			address: safeAddress,
			slug: safeSlug,
			coAuthors: uniqueCoAuthors,
			imageFocusX,
			imageFocusY
		} = formData;
		const ratingValues = getReviewRatingValues(formData);

		const image = data.get('image');

		// validation
		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'invalid_bar_name'
			});
			return failReviewForm(400, 'Ogiltigt namn på baren', '/bar-name', formData);
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return failReviewForm(400, 'Ogiltig beskrivning', '/description', formData);
		}

		// IMPORTANT: if the form field names don't match, these become NaN and you end up here
		if (hasInvalidRatingValues(ratingValues)) {
			return failReviewForm(
				400,
				`Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
				'/',
				formData
			);
		}

		if (hasInvalidOverallRating(rating)) {
			return failReviewForm(400, 'Ogiltigt helhetsbetyg', '/rating', formData);
		}

		if (!(image instanceof File) || image.size === 0) {
			return failReviewForm(400, 'Ogiltig fil', '/image', formData);
		}

		if (image.size > MAX_IMAGE_SIZE) {
			return failReviewForm(400, REVIEW_IMAGE_TOO_LARGE_MESSAGE, '/image', formData);
		}

		const fileExt = getImageExtension(image.type);
		if (!fileExt) {
			return failReviewForm(
				400,
				`Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`,
				'/image',
				formData
			);
		}

		if (!safeAddress.length || safeAddress.length > MAX_SHORT_TEXT) {
			return failReviewForm(400, 'Ogiltig adress', '/address', formData);
		}

		if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
			return failReviewForm(400, 'Ogiltig slug', '/slug', formData);
		}

		if (uniqueCoAuthors.length > MAX_COAUTHORS) {
			return failReviewForm(400, 'För många medförfattare', '/co-authors', formData);
		}

		try {
			const validUsernames = new Set(
				(
					await users
						.find({ username: { $in: uniqueCoAuthors } }, { projection: { username: 1 } })
						.toArray()
				).map((user) => user.username)
			);

			if (validUsernames.size !== uniqueCoAuthors.length) {
				return failReviewForm(
					400,
					'En eller flera medförfattare är ogiltiga',
					'/co-authors',
					formData
				);
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
			const existing = await bars.findOne({ slug: safeSlug });
			if (existing) {
				await logAuditEvent({
					eventType: 'review_create',
					outcome: 'failure',
					username,
					ip,
					targetSlug: safeSlug,
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

		const randomFileName = new ObjectId().toHexString();
		const uploadedImageName = `${randomFileName}.${fileExt}`;
		const uploadedImagePath = getReviewImageUploadPath(uploadedImageName);
		let imageData: Uint8Array;
		try {
			imageData = await image.bytes();
		} catch (err) {
			console.error('Image read failed:', err);
			return failReviewForm(400, 'Kunde inte läsa bilden', '/image', formData);
		}

		if (!matchesImageSignature(imageData, image.type)) {
			return failReviewForm(400, 'Bildens innehåll matchar inte filtypen', '/image', formData);
		}

		let sanitizedImageData: Buffer;
		try {
			sanitizedImageData = await sanitizeReviewImage(imageData, image.type);
		} catch (err) {
			console.error('Image processing failed:', err);
			return failReviewForm(400, 'Kunde inte bearbeta bilden', '/image', formData);
		}

		try {
			writeFileSync(uploadedImagePath, sanitizedImageData);
		} catch (err) {
			console.error('Image upload failed:', err);
			return failReviewForm(400, 'Kunde inte ladda upp bilden', '/image', formData);
		}

		const now = new Date();

		// insert
		try {
			await bars.insertOne({
				_id: new ObjectId(),
				title: safeBarName,
				description: safeDescription,
				atmosphere,
				service,
				selection,
				quality,
				price,
				cleanliness,
				soundLevel,
				barhopPotential,
				rating,
				location: safeAddress,
				image: uploadedImageName,
				imageFocusX,
				imageFocusY,
				slug: safeSlug,
				author: currentUsername,
				coAuthors: uniqueCoAuthors,
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
				targetSlug: safeSlug,
				reason: isDuplicateSlugError(err) ? 'duplicate_slug_insert' : 'insert_failed'
			});
			try {
				unlinkSync(uploadedImagePath);
			} catch (cleanupError) {
				console.error('Image cleanup failed:', cleanupError);
			}

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
			targetSlug: safeSlug
		});

		// must THROW redirect
		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
