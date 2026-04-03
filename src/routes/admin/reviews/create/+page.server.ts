import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { users } from '$lib/db/users';
import { ObjectId } from 'mongodb';
import { unlinkSync, writeFileSync } from 'fs';
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

const isDuplicateSlugError = (error: unknown): boolean => {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: number }).code === 11000
	);
};

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

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
	default: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { pointer: '/', message: 'Du är inte inloggad' });
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
		const safeCoAuthors = coAuthorsArray
			.filter((c) => typeof c === 'string')
			.map((c) => sanitizePlainText(c));

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
			coAuthors: safeCoAuthors
		};

		// validation
		if (!safeBarName.length || safeBarName.length > MAX_SHORT_TEXT) {
			return fail(400, { pointer: '/bar-name', message: 'Ogiltigt namn på baren', ...formData });
		}

		if (!safeDescription.length || safeDescription.length > MAX_LONG_TEXT) {
			return fail(400, { pointer: '/description', message: 'Ogiltig beskrivning', ...formData });
		}

		// IMPORTANT: if the form field names don't match, these become NaN and you end up here
		if (ratingValues.some((v) => Number.isNaN(v) || v < 0 || v > 5)) {
			return fail(400, {
				pointer: '/',
				message: `Ogiltiga betyg (kontrollera fältnamnen: atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential)`,
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

		const fileExt = ALLOWED_IMAGE_MIME[image.type];
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

		if (safeCoAuthors.length > 50) {
			return fail(400, {
				pointer: '/co-authors',
				message: 'För många medförfattare',
				...formData
			});
		}

		// prevent slug collision before we write the image file
		try {
			const existing = await bars.findOne({ slug: safeSlug });
			if (existing) {
				return fail(400, {
					pointer: '/slug',
					message: 'En bar med den här sluggen finns redan',
					...formData
				});
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			return fail(400, { pointer: '/', message: 'Kunde inte skapa recensionen', ...formData });
		}

		// upload image
		const uploadFolder = process.cwd() + '/static/images';

		const randomFileName = new ObjectId().toHexString();
		const uploadedImagePath = `${uploadFolder}/${randomFileName}.${fileExt}`;
		const imageData = await image.bytes();

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
				image: `${randomFileName}.${fileExt}`,
				slug: safeSlug,
				author: locals.user.username,
				coAuthors: safeCoAuthors,
				changeLog: [],
				createdAt: now,
				updatedAt: now
			});
		} catch (err) {
			console.error('Insert failed:', err);
			if (isDuplicateSlugError(err)) {
				try {
					unlinkSync(uploadedImagePath);
				} catch (cleanupError) {
					console.error('Image cleanup failed:', cleanupError);
				}
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

		// must THROW redirect
		throw redirect(303, `/${encodeURIComponent(safeSlug)}`);
	}
};
