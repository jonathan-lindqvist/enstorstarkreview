import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';
import { calculateOverallRating } from '$lib/utils/ratings';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const bar = await bars.findOne({ slug: params.slug });
	if (!bar) throw error(404, 'Not found');

	return {
		bar: {
			...bar,
			_id: bar._id.toString()
		}
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

		const atmosphere = Number(data.get('atmosphere'));
		const service = Number(data.get('service'));
		const selection = Number(data.get('selection'));
		const quality = Number(data.get('quality'));
		const price = Number(data.get('price'));
		const cleanliness = Number(data.get('cleanliness'));
		const soundLevel = Number(data.get('soundLevel'));

		const ratingValues = [atmosphere, service, selection, quality, price, cleanliness, soundLevel];

		if (
			typeof id !== 'string' ||
			typeof barName !== 'string' ||
			typeof description !== 'string' ||
			typeof address !== 'string' ||
			typeof slug !== 'string'
		) {
			return fail(400, { message: 'Invalid form data' });
		}

		if (ratingValues.some((v) => Number.isNaN(v) || v < 0 || v > 5)) {
			return fail(400, { message: 'Invalid ratings' });
		}

		const rating = calculateOverallRating(ratingValues);

		const update: any = {
			title: barName,
			description,
			atmosphere,
			service,
			selection,
			quality,
			price,
			cleanliness,
			soundLevel,
			rating,
			location: address,
			slug,
			updatedAt: new Date()
		};

		if (image instanceof File && image.size > 0) {
			const uploadFolder = process.cwd() + '/static/images';
			const ext = image.name.split('.').pop();
			const filename = new ObjectId().toHexString();
			const bytes = await image.bytes();

			writeFileSync(`${uploadFolder}/${filename}.${ext}`, bytes);
			update.image = `${filename}.${ext}`;
		}

		const existing = await bars.findOne({
			slug,
			_id: { $ne: new ObjectId(id) }
		});

		if (existing) {
			return fail(400, { message: 'Slug already exists' });
		}

		await bars.updateOne({ _id: new ObjectId(id) }, { $set: update });

		throw redirect(303, `/${slug}`);
	}
};
