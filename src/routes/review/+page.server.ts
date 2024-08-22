import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import type { BarReview } from '$lib/types/bar-review';
import { ObjectId } from 'mongodb';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	return null;
};

export const actions: Actions = {
	review: async ({ request }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const description = formData.get('description');
		const rating = Number(formData.get('rating'));
		const imagePath = formData.get('imagePath');
		const location = formData.get('location');
		const slug = formData.get('slug');

		if (typeof title !== 'string' || title.length > 255 || title.length < 2) {
			return fail(400, { message: 'Invalid bar title' });
		}
		if (typeof description !== 'string' || description.length < 2) {
			return fail(400, { message: 'Invalid bar description' });
		}

		if (isNaN(rating) || rating < 0 || rating > 3) {
			return fail(400, { message: 'Invalid bar rating' });
		}

		if (typeof imagePath !== 'string' || imagePath.length < 5) {
			return fail(400, { message: 'Invalid bar imagePath' });
		}

		if (typeof location !== 'string' || location.length < 5) {
			return fail(400, { message: 'Invalid bar location' });
		}

		if (typeof slug !== 'string' || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) {
			return fail(400, { message: 'Invalid bar slug' });
		}

		const barDocument: BarReview = {
			_id: new ObjectId(),
			title: title,
			description: description,
			rating: rating,
			image: imagePath,
			location: location,
			slug: slug,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const result = await bars.insertOne(barDocument);

		if (!result.acknowledged || !result.insertedId) {
			return fail(400, { message: 'Could not save review' });
		}

		return { status: 200, body: { message: 'Review saved!' } };
	}
};
