import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';
import type { BarReviewUpdate } from '$lib/types/bar-review';

const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
const MAX_SHORT_TEXT = 300;
const MAX_LONG_TEXT = 20000;
const MAX_COAUTHORS_TEXT = 1000;
const MAX_SLUG_LENGTH = 200;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const ALLOWED_IMAGE_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const sanitizePlainText = (value: string): string => {
	return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
};

const sanitizeLongText = (value: string): string => {
	return value.replace(CONTROL_CHARS, '').trim();
};

const sanitizeSlug = (value: string): string => {
	return value
		.replace(CONTROL_CHARS, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^0-9A-Za-z\u00C0-\u017F-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^[-]+|[-]+$/g, '');
};

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

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
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

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

		const safeBarName = sanitizePlainText(barName);
		const safeDescription = sanitizeLongText(description);
		const safeAddress = sanitizePlainText(address);
		const safeSlug = sanitizeSlug(slug);
		const safeCoAuthors = coAuthorsArray
			.filter((c) => typeof c === 'string')
			.map((c) => sanitizePlainText(c));

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

		if (safeCoAuthors.length > 50) {
			return fail(400, { message: 'Ogiltiga formulärdata' });
		}

		if (ratingValues.some((v) => Number.isNaN(v) || v < 0 || v > 5)) {
			return fail(400, { message: 'Ogiltiga betyg' });
		}

		const rating = calculateOverallRating(ratingValues);

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
			updatedAt: new Date()
		};

		// Only add coAuthors if provided
		update.coAuthors = safeCoAuthors;

		if (image instanceof File && image.size > 0) {
			if (image.size > MAX_IMAGE_SIZE) {
				return fail(400, { message: 'Bilden är för stor (max 25 MB)' });
			}

			const fileExt = ALLOWED_IMAGE_MIME[image.type];
			if (!fileExt) {
				return fail(400, { message: 'Ogiltig filtyp' });
			}

			const uploadFolder = process.cwd() + '/static/images';
			const filename = new ObjectId().toHexString();
			const bytes = await image.bytes();

			try {
				writeFileSync(`${uploadFolder}/${filename}.${fileExt}`, bytes);
				update.image = `${filename}.${fileExt}`;
			} catch (err) {
				console.error('Image upload failed:', err);
				return fail(400, { message: 'Kunde inte uppdatera recensionen' });
			}
		}

		try {
			const existing = await bars.findOne({
				slug: safeSlug,
				_id: { $ne: new ObjectId(id) }
			});

			if (existing) {
				return fail(400, { message: 'Sluggen finns redan' });
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			return fail(400, { message: 'Kunde inte uppdatera recensionen' });
		}

		try {
			await bars.updateOne({ _id: new ObjectId(id) }, { $set: update });
		} catch (err) {
			console.error('Update failed:', err);
			return fail(400, { message: 'Kunde inte uppdatera recensionen' });
		}

		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
