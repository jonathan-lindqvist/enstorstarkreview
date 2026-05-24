import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { unlinkSync, writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';
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
	getImageExtension,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	matchesImageSignature,
	normalizeCoAuthors,
	sanitizeLongText,
	sanitizePlainText,
	sanitizeSlug
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
			return fail(401, { pointer: '/', message: 'Du är inte inloggad' });
		}

		const currentUsername = locals.user.username;

		await logAuditEvent({
			eventType: 'review_create',
			outcome: 'attempt',
			username,
			ip
		});

		const data = await request.formData();

		const barName = data.get('bar-name');
		const description = data.get('description');

		const atmosphere = Number(data.get('atmosphere'));
		const service = Number(data.get('service'));
		const selection = Number(data.get('selection'));
		const quality = Number(data.get('quality'));
		const price = Number(data.get('price'));
		const cleanliness = Number(data.get('cleanliness'));
		const soundLevel = Number(data.get('soundLevel'));
		const barhopPotential = Number(data.get('barhopPotential'));

		const ratingValues = [
			atmosphere,
			service,
			selection,
			quality,
			price,
			cleanliness,
			soundLevel,
			barhopPotential
		];

		const image = data.get('image');
		const address = data.get('address');
		const slug = data.get('slug');
		const coAuthorsArray = data.getAll('co-authors');

		const safeBarName = typeof barName === 'string' ? sanitizePlainText(barName) : '';
		const safeDescription = typeof description === 'string' ? sanitizeLongText(description) : '';
		const safeAddress = typeof address === 'string' ? sanitizePlainText(address) : '';
		const safeSlug = typeof slug === 'string' ? sanitizeSlug(slug) : '';
		const uniqueCoAuthors = normalizeCoAuthors(coAuthorsArray, currentUsername);

		const formData = {
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
			address: safeAddress,
			slug: safeSlug,
			coAuthors: uniqueCoAuthors
		};

		// validation
		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			await logAuditEvent({
				eventType: 'review_create',
				outcome: 'failure',
				username,
				ip,
				reason: 'invalid_bar_name'
			});
			return fail(400, { pointer: '/bar-name', message: 'Ogiltigt namn på baren', ...formData });
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return fail(400, { pointer: '/description', message: 'Ogiltig beskrivning', ...formData });
		}

		// IMPORTANT: if the form field names don't match, these become NaN and you end up here
		if (hasInvalidRatingValues(ratingValues)) {
			return fail(400, {
				pointer: '/',
				message: `Ogiltiga betyg (kontrollera fältnamnen: ${REVIEW_RATING_FIELD_NAMES})`,
				...formData
			});
		}

		if (!(image instanceof File) || image.size === 0) {
			return fail(400, { pointer: '/image', message: 'Ogiltig fil', ...formData });
		}

		if (image.size > MAX_IMAGE_SIZE) {
			return fail(400, {
				pointer: '/image',
				message: 'Bilden är för stor (max 25 MB)',
				...formData
			});
		}

		const fileExt = getImageExtension(image.type);
		if (!fileExt) {
			return fail(400, {
				pointer: '/image',
				message: 'Ogiltig filtyp. Endast JPEG, PNG, WebP och GIF är tillåtna',
				...formData
			});
		}

		if (!safeAddress.length || safeAddress.length > MAX_SHORT_TEXT) {
			return fail(400, { pointer: '/address', message: 'Ogiltig adress', ...formData });
		}

		if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
			return fail(400, { pointer: '/slug', message: 'Ogiltig slug', ...formData });
		}

		if (uniqueCoAuthors.length > MAX_COAUTHORS) {
			return fail(400, {
				pointer: '/co-authors',
				message: 'För många medförfattare',
				...formData
			});
		}

		const validUsernames = new Set(
			(
				await users
					.find({ username: { $in: uniqueCoAuthors } }, { projection: { username: 1 } })
					.toArray()
			).map((user) => user.username)
		);

		if (validUsernames.size !== uniqueCoAuthors.length) {
			return fail(400, {
				pointer: '/co-authors',
				message: 'En eller flera medförfattare är ogiltiga',
				...formData
			});
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
				return fail(400, {
					pointer: '/slug',
					message: 'En bar med den här sluggen finns redan',
					...formData
				});
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
			return fail(400, { pointer: '/', message: 'Kunde inte skapa recensionen', ...formData });
		}

		const randomFileName = new ObjectId().toHexString();
		const uploadedImageName = `${randomFileName}.${fileExt}`;
		const uploadedImagePath = getReviewImageUploadPath(uploadedImageName);
		const imageData = await image.bytes();

		if (!matchesImageSignature(imageData, image.type)) {
			return fail(400, {
				pointer: '/image',
				message: 'Bildens innehåll matchar inte filtypen',
				...formData
			});
		}

		try {
			writeFileSync(uploadedImagePath, imageData);
		} catch (err) {
			console.error('Image upload failed:', err);
			return fail(400, { pointer: '/image', message: 'Kunde inte ladda upp bilden', ...formData });
		}

		// calculate derived rating
		const rating = calculateOverallRating(ratingValues);
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
				return fail(400, {
					pointer: '/slug',
					message: 'En bar med den här sluggen finns redan',
					...formData
				});
			}
			return fail(400, {
				pointer: '/',
				message: 'Kunde inte skapa recensionen',
				...formData
			});
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
