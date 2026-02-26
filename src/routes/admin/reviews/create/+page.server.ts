import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';

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

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	return {
		username: locals.user.username
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { pointer: '/', message: 'You are not logged in' });
		}

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

		const ratingValues = [atmosphere, service, selection, quality, price, cleanliness, soundLevel];

		const image = data.get('image');
		const address = data.get('address');
		const slug = data.get('slug');
		const coAuthors = data.get('co-authors');

		const safeBarName = typeof barName === 'string' ? sanitizePlainText(barName) : '';
		const safeDescription = typeof description === 'string' ? sanitizeLongText(description) : '';
		const safeAddress = typeof address === 'string' ? sanitizePlainText(address) : '';
		const safeSlug = typeof slug === 'string' ? sanitizeSlug(slug) : '';
		const safeCoAuthors = typeof coAuthors === 'string' ? sanitizePlainText(coAuthors) : '';

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
			address: safeAddress,
			slug: safeSlug,
			coAuthors: safeCoAuthors
		};

		// validation
		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			return fail(400, { pointer: '/bar-name', message: 'Invalid bar name', ...formData });
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return fail(400, { pointer: '/description', message: 'Invalid description', ...formData });
		}

		// IMPORTANT: if the form field names don't match, these become NaN and you end up here
		if (ratingValues.some((v) => Number.isNaN(v) || v < 0 || v > 5)) {
			return fail(400, {
				pointer: '/',
				message: `Invalid ratings (check form input names match: atmosphere, service, selection, quality, price, cleanliness, soundLevel)`,
				...formData
			});
		}

		if (!(image instanceof File) || image.size === 0) {
			return fail(400, { pointer: '/image', message: 'Invalid file', ...formData });
		}

		if (image.size > MAX_IMAGE_SIZE) {
			return fail(400, {
				pointer: '/image',
				message: 'Image too large (max 25MB)',
				...formData
			});
		}

		const fileExt = ALLOWED_IMAGE_MIME[image.type];
		if (!fileExt) {
			return fail(400, {
				pointer: '/image',
				message: 'Invalid file type. Only JPEG, PNG, WebP, and GIF allowed',
				...formData
			});
		}

		if (!safeAddress.length || safeAddress.length > MAX_SHORT_TEXT) {
			return fail(400, { pointer: '/address', message: 'Invalid address', ...formData });
		}

		if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
			return fail(400, { pointer: '/slug', message: 'Invalid slug', ...formData });
		}

		if (safeCoAuthors.length > MAX_COAUTHORS_TEXT) {
			return fail(400, {
				pointer: '/co-authors',
				message: 'Co-authors list too long',
				...formData
			});
		}

		// upload image
		const uploadFolder = process.cwd() + '/static/images';

		const randomFileName = new ObjectId().toHexString();
		const imageData = await image.bytes();

		try {
			writeFileSync(`${uploadFolder}/${randomFileName}.${fileExt}`, imageData);
		} catch (err) {
			console.error('Image upload failed:', err);
			return fail(400, { pointer: '/image', message: 'Could not upload image', ...formData });
		}

		// prevent slug collision
		try {
			const existing = await bars.findOne({ slug: safeSlug });
			if (existing) {
				return fail(400, {
					pointer: '/slug',
					message: 'Bar with this slug already exists',
					...formData
				});
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			return fail(400, { pointer: '/', message: 'Could not create review', ...formData });
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
				rating,
				location: safeAddress,
				image: `${randomFileName}.${fileExt}`,
				slug: safeSlug,
				author: locals.user.username,
				coAuthors: safeCoAuthors,
				createdAt: now,
				updatedAt: now
			});
		} catch (err) {
			console.error('Insert failed:', err);
			return fail(400, {
				pointer: '/',
				message: 'Could not create review',
				...formData
			});
		}

		// must THROW redirect
		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
