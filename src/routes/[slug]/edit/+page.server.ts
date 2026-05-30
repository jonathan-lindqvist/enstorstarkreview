import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { unlinkSync, writeFileSync } from 'fs';
import { REVIEW_IMAGE_ALLOWED_TYPES_LABEL, REVIEW_IMAGE_TOO_LARGE_MESSAGE } from '$lib/constants';
import type { BarReviewUpdate, ReviewFieldChange } from '$lib/types/bar-review';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import { getReviewImageUploadPath } from '$lib/server/review-images';
import {
	MAX_COAUTHORS,
	MAX_IMAGE_SIZE,
	MAX_LONG_TEXT,
	MAX_SHORT_TEXT,
	MAX_SLUG_LENGTH,
	buildReviewFormData,
	failReviewForm,
	getImageExtension,
	getReviewRatingValues,
	hasInvalidOverallRating,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	matchesImageSignature,
	sanitizeReviewImage,
	sanitizeSlug
} from '$lib/server/review-form';

const formatValue = (value: unknown): string => {
	if (Array.isArray(value)) {
		return value.length ? value.join(', ') : 'Inga';
	}
	if (typeof value === 'number') {
		return value.toString();
	}
	if (typeof value === 'string') {
		return value.length ? value : 'Tom';
	}
	if (value === undefined || value === null) {
		return 'Tom';
	}
	return String(value);
};

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
			_id: bar._id.toString()
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
		const image = data.get('image');
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

		if (typeof id !== 'string' || !ObjectId.isValid(id)) {
			return failReviewForm(400, 'Ogiltiga formulärdata', '/', formData);
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
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}
		if (!existingBar) {
			return failReviewForm(404, 'Recensionen hittades inte', '/', formData);
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
			return failReviewForm(400, 'Ogiltiga formulärdata', '/', formData);
		}

		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			return failReviewForm(400, 'Ogiltigt namn på baren', '/bar-name', formData);
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return failReviewForm(400, 'Ogiltig beskrivning', '/description', formData);
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
				eventType: 'review_edit',
				outcome: 'failure',
				username: currentUsername,
				ip,
				targetSlug: safeSlug,
				targetId: id,
				reason: 'coauthor_validation_failed'
			});
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}

		try {
			const existing = await bars.findOne({
				slug: safeSlug,
				_id: { $ne: new ObjectId(id) }
			});

			if (existing) {
				await logAuditEvent({
					eventType: 'review_edit',
					outcome: 'failure',
					username: currentUsername,
					ip,
					targetSlug: safeSlug,
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
				targetSlug: safeSlug,
				targetId: id,
				reason: 'slug_check_failed'
			});
			return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/', formData);
		}

		if (hasInvalidRatingValues(ratingValues)) {
			return failReviewForm(400, 'Ogiltiga betyg', '/', formData);
		}

		if (hasInvalidOverallRating(rating)) {
			return failReviewForm(400, 'Ogiltigt helhetsbetyg', '/rating', formData);
		}

		const now = new Date();

		const update: BarReviewUpdate = {
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
			slug: safeSlug,
			imageFocusX,
			imageFocusY,
			updatedAt: now
		};

		// Only add coAuthors if provided
		update.coAuthors = uniqueCoAuthors;

		let uploadedImagePath: string | null = null;
		if (image instanceof File && image.size > 0) {
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

			const filename = new ObjectId().toHexString();
			const imageFilename = `${filename}.${fileExt}`;
			let bytes: Uint8Array;
			try {
				bytes = await image.bytes();
			} catch (err) {
				console.error('Image read failed:', err);
				return failReviewForm(400, 'Kunde inte läsa bilden', '/image', formData);
			}
			uploadedImagePath = getReviewImageUploadPath(imageFilename);

			if (!matchesImageSignature(bytes, image.type)) {
				return failReviewForm(400, 'Bildens innehåll matchar inte filtypen', '/image', formData);
			}

			let sanitizedBytes: Buffer;
			try {
				sanitizedBytes = await sanitizeReviewImage(bytes, image.type);
			} catch (err) {
				console.error('Image processing failed:', err);
				return failReviewForm(400, 'Kunde inte bearbeta bilden', '/image', formData);
			}

			try {
				writeFileSync(uploadedImagePath, sanitizedBytes);
				update.image = imageFilename;
			} catch (err) {
				console.error('Image upload failed:', err);
				return failReviewForm(400, 'Kunde inte uppdatera recensionen', '/image', formData);
			}
		}

		const potentialChanges: Array<{
			field: string;
			label: string;
			before: unknown;
			after: unknown;
		}> = [
			{ field: 'title', label: 'Barens namn', before: existingBar.title, after: safeBarName },
			{
				field: 'description',
				label: 'Beskrivning',
				before: existingBar.description,
				after: safeDescription
			},
			{ field: 'location', label: 'Adress', before: existingBar.location, after: safeAddress },
			{ field: 'slug', label: 'URL-slug', before: existingBar.slug, after: safeSlug },
			{
				field: 'imageFocusX',
				label: 'Bildfokus X',
				before: existingBar.imageFocusX ?? 50,
				after: imageFocusX
			},
			{
				field: 'imageFocusY',
				label: 'Bildfokus Y',
				before: existingBar.imageFocusY ?? 50,
				after: imageFocusY
			},
			{
				field: 'coAuthors',
				label: 'Medförfattare',
				before: existingBar.coAuthors ?? [],
				after: uniqueCoAuthors
			},
			{ field: 'atmosphere', label: 'Atmosfär', before: existingBar.atmosphere, after: atmosphere },
			{ field: 'service', label: 'Service', before: existingBar.service, after: service },
			{ field: 'selection', label: 'Utbud', before: existingBar.selection, after: selection },
			{ field: 'quality', label: 'Kvalitet', before: existingBar.quality, after: quality },
			{ field: 'price', label: 'Prisvärdhet', before: existingBar.price, after: price },
			{
				field: 'cleanliness',
				label: 'Renlighet',
				before: existingBar.cleanliness,
				after: cleanliness
			},
			{ field: 'soundLevel', label: 'Ljudnivå', before: existingBar.soundLevel, after: soundLevel },
			{
				field: 'barhopPotential',
				label: 'Barhoppotential',
				before: existingBar.barhopPotential,
				after: barhopPotential
			},
			{ field: 'rating', label: 'Helhetsbetyg', before: existingBar.rating, after: rating }
		];

		if (update.image) {
			potentialChanges.push({
				field: 'image',
				label: 'Bild',
				before: existingBar.image,
				after: update.image
			});
		}

		const changes: ReviewFieldChange[] = potentialChanges
			.filter((entry) => formatValue(entry.before) !== formatValue(entry.after))
			.map((entry) => ({
				field: entry.field,
				label: entry.label,
				before: formatValue(entry.before),
				after: formatValue(entry.after)
			}));

		const nextChangeLog =
			changes.length > 0
				? [
						...(existingBar.changeLog ?? []),
						{
							updatedAt: now,
							updatedBy: currentUsername,
							changes
						}
					]
				: (existingBar.changeLog ?? []);

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
				targetSlug: safeSlug,
				targetId: id,
				reason: isDuplicateSlugError(err) ? 'duplicate_slug_update' : 'update_failed'
			});
			if (uploadedImagePath) {
				try {
					unlinkSync(uploadedImagePath);
				} catch (cleanupError) {
					console.error('Image cleanup failed:', cleanupError);
				}
			}

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
			targetSlug: safeSlug,
			targetId: id
		});

		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
