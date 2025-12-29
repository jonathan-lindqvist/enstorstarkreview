import { fail, redirect, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bars } from '$lib/db/bars';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/login');

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
		const rating = data.get('rating');
		const address = data.get('address');
		const slug = data.get('slug');
		const image = data.get('image');

		if (
			typeof id !== 'string' ||
			typeof barName !== 'string' ||
			typeof description !== 'string' ||
			typeof rating !== 'string' ||
			typeof address !== 'string' ||
			typeof slug !== 'string'
		) {
			return fail(400, { message: 'Invalid form data' });
		}

		const update: any = {
			title: barName,
			description,
			rating: Number(rating),
			location: address,
			slug,
			updatedAt: new Date()
		};

		// optional image update
		if (image instanceof File && image.size > 0) {
			const uploadFolder = process.cwd() + '/static/images';
			const ext = image.name.split('.').pop();
			const filename = new ObjectId().toHexString();
			const bytes = await image.bytes();

			try {
				writeFileSync(`${uploadFolder}/${filename}.${ext}`, bytes);
				update.image = `${filename}.${ext}`;
			} catch {
				return fail(400, { message: 'Image upload failed' });
			}
		}

		// prevent slug collisions
		const existing = await bars.findOne({
			slug,
			_id: { $ne: new ObjectId(id) }
		});

		if (existing) {
			return fail(400, { message: 'Slug already exists' });
		}

		await bars.updateOne({ _id: new ObjectId(id) }, { $set: update });

		redirect(303, `/${slug}`);
	}
};
