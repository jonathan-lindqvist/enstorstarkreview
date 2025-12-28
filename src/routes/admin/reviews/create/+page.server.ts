import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { ObjectId } from 'mongodb';
import { writeFileSync } from 'fs';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');

	return {
		username: locals.user.username
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { pointer: '/', message: 'You are not logged in'})

		const data = await request.formData()
		const barName = data.get('bar-name')
		const description = data.get('description')
		const rating = data.get('rating')
		const image = data.get('image')
		const address = data.get('address')
		const slug = data.get('slug')

		if (typeof barName !== 'string' || !barName.length) {
			return fail(400, { pointer: '/bar-name', message: 'Invalid bar name'})
		}

		if (typeof description !== 'string' || !description.length) {
			return fail(400, { pointer: '/description', message: 'Invalid description'})
		}

		if (typeof rating !== 'string') {
			return fail(400, { pointer: '/rating', message: 'Invalid rating'})
		}

		if (Number(rating) < 0 || Number(rating) > 5) {
			return fail(400, { pointer: '/rating', message: 'Invalid rating'})
		}

		if (!(image instanceof File)) {
			return fail(400, { pointer: '/image', message: 'Invalid file'})
		}

		if (image.size === 0) {
			return fail(400, { pointer: '/image', message: 'Invalid file'})
		}

		if (typeof address !== 'string' || !address.length) {
			return fail(400, { pointer: '/address', message: 'Invalid address'})
		}

		if (typeof slug !== 'string' || !slug.length) {
			return fail(400, { pointer: '/slug', message: 'Invalid slug'})
		}

		const projectRoot = process.cwd()
		const uploadFolder = projectRoot + '/static/images'
		const fileExt = image.name.split('.').pop()
		const randomFileName = new ObjectId()
		const imageData = await image.bytes()

		try {
			writeFileSync(`${uploadFolder}/${randomFileName}.${fileExt}`, imageData)
		} catch (_error) {
			return fail(400, { pointer: '/image', message: 'Could not upload image' })
		}

		try {
			const bar = await bars.findOne({slug: slug})

			if (bar) {
				return fail(400, { pointer: '/slug', message: 'Bar with this slug already exists'})
			}
		} catch (_error) {
			return fail(400, { pointer: '/', message: 'Could not create review'})
		}

		try {
			const todaysDate = new Date()
			await bars.insertOne({
				_id: new ObjectId(),
				title: barName,
				description: description,
				rating: Number(rating),
				location: address,
				image: `${randomFileName}.${fileExt}`,
				slug: slug,
				createdAt: todaysDate,
				updatedAt: todaysDate
			})
		} catch (_error) {
			return fail(400, { pointer: '/', message: 'Could not create review'})
		}

		return {
			success: true
		}
	}
};