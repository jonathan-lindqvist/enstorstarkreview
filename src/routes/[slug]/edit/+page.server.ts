import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { unlinkSync, writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';
import type { BarReviewUpdate, ReviewFieldChange } from '$lib/types/bar-review';
import { logAuditEvent } from '$lib/server/audit';
import { getRequestIp } from '$lib/server/request';
import {
	MAX_COAUTHORS,
	MAX_IMAGE_SIZE,
	MAX_LONG_TEXT,
	MAX_SHORT_TEXT,
	MAX_SLUG_LENGTH,
	getImageExtension,
	hasInvalidRatingValues,
	isDuplicateSlugError,
	matchesImageSignature,
	normalizeCoAuthors,
	sanitizeLongText,
	sanitizePlainText,
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
			return fail(401);
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
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		const data = await request.formData();

		const id = data.get('id');
		const barName = data.get('bar-name');
		const description = data.get('description');
		const address = data.get('address');
		const slug = data.get('slug');
		const image = data.get('image');
		const coAuthorsArray = data.getAll('co-authors');

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

		if (
			typeof id !== 'string' ||
			typeof barName !== 'string' ||
			typeof description !== 'string' ||
			typeof address !== 'string' ||
			typeof slug !== 'string'
		) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (!ObjectId.isValid(id)) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		const existingBar = await bars.findOne({ _id: new ObjectId(id) });
		if (!existingBar) {
			return fail(404, { message: 'Recensionen hittades inte' });
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
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		const safeBarName = sanitizePlainText(barName);
		const safeDescription = sanitizeLongText(description);
		const safeAddress = sanitizePlainText(address);
		const safeSlug = sanitizeSlug(slug);
		const uniqueCoAuthors = normalizeCoAuthors(coAuthorsArray, currentUsername);

		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (!safeAddress.length || safeAddress.length > MAX_SHORT_TEXT) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (uniqueCoAuthors.length > MAX_COAUTHORS) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		const validUsernames = new Set(
			(
				await users
					.find({ username: { $in: uniqueCoAuthors } }, { projection: { username: 1 } })
					.toArray()
			).map((user) => user.username)
		);

		if (validUsernames.size !== uniqueCoAuthors.length) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
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
				return fail(400, { message: 'Sluggen finns redan' });
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
			return fail(400, { message: 'Kunde inte uppdatera recensionen' });
		}

		if (hasInvalidRatingValues(ratingValues)) {
			return fail(400, { message: 'Ogiltiga betyg' });
		}

		const rating = calculateOverallRating(ratingValues);
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
			updatedAt: now
		};

		// Only add coAuthors if provided
		update.coAuthors = uniqueCoAuthors;

		let uploadedImagePath: string | null = null;
		if (image instanceof File && image.size > 0) {
			if (image.size > MAX_IMAGE_SIZE) {
				return fail(400, { message: 'Bilden är för stor (max 25 MB)' });
			}

			const fileExt = getImageExtension(image.type);
			if (!fileExt) {
				return fail(400, { message: 'Ogiltig filtyp' });
			}

			const uploadFolder = process.cwd() + '/static/images';
			const filename = new ObjectId().toHexString();
			const bytes = await image.bytes();
			uploadedImagePath = `${uploadFolder}/${filename}.${fileExt}`;

			if (!matchesImageSignature(bytes, image.type)) {
				return fail(400, { message: 'Bildens innehåll matchar inte filtypen' });
			}

			try {
				writeFileSync(uploadedImagePath, bytes);
				update.image = `${filename}.${fileExt}`;
			} catch (err) {
				console.error('Image upload failed:', err);
				return fail(400, { message: 'Kunde inte uppdatera recensionen' });
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
				return fail(400, { message: 'Sluggen finns redan' });
			}
			return fail(400, { message: 'Kunde inte uppdatera recensionen' });
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
