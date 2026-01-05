import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';


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

		// validation
		if (typeof barName !== 'string' || !barName.trim().length) {
			return fail(400, { pointer: '/bar-name', message: 'Invalid bar name' });
		}

		if (typeof description !== 'string' || !description.trim().length) {
			return fail(400, { pointer: '/description', message: 'Invalid description' });
		}

		// IMPORTANT: if the form field names don't match, these become NaN and you end up here
		if (ratingValues.some((v) => Number.isNaN(v) || v < 0 || v > 5)) {
			return fail(400, {
				pointer: '/',
				message: `Invalid ratings (check form input names match: atmosphere, service, selection, quality, price, cleanliness, soundLevel)`
			});
		}

		if (!(image instanceof File) || image.size === 0) {
			return fail(400, { pointer: '/image', message: 'Invalid file' });
		}

		if (typeof address !== 'string' || !address.trim().length) {
			return fail(400, { pointer: '/address', message: 'Invalid address' });
		}

		if (typeof slug !== 'string' || !slug.trim().length) {
			return fail(400, { pointer: '/slug', message: 'Invalid slug' });
		}

		// upload image
		const uploadFolder = process.cwd() + '/static/images';
		const fileExt = image.name.includes('.') ? image.name.split('.').pop() : null;

		if (!fileExt) {
			return fail(400, { pointer: '/image', message: 'Image file must have an extension' });
		}

		const randomFileName = new ObjectId().toHexString();
		const imageData = await image.bytes();

		try {
			writeFileSync(`${uploadFolder}/${randomFileName}.${fileExt}`, imageData);
		} catch (err) {
			console.error('Image upload failed:', err);
			return fail(400, { pointer: '/image', message: 'Could not upload image' });
		}

		// prevent slug collision
		try {
			const existing = await bars.findOne({ slug: slug.trim() });
			if (existing) {
				return fail(400, { pointer: '/slug', message: 'Bar with this slug already exists' });
			}
		} catch (err) {
			console.error('Slug check failed:', err);
			return fail(400, { pointer: '/', message: 'Could not create review' });
		}

		// calculate derived rating
		const rating = calculateOverallRating(ratingValues);
		const now = new Date();

		// insert
		try {
			await bars.insertOne({
				_id: new ObjectId(),
				title: barName.trim(),
				description: description.trim(),
				atmosphere,
				service,
				selection,
				quality,
				price,
				cleanliness,
				soundLevel,
				rating,
				location: address.trim(),
				image: `${randomFileName}.${fileExt}`,
				slug: slug.trim(),
				createdAt: now,
				updatedAt: now
			});
		} catch (err) {
			console.error('Insert failed:', err);
			return fail(400, { pointer: '/', message: 'Could not create review (DB insert failed)' });
		}

		// must THROW redirect
		throw redirect(303, `/${slug.trim()}`);
	}
};
