import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error } from '@sveltejs/kit';

const MAX_SLUG_LENGTH = 200;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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
	// Decode the slug to handle Swedish characters (åäö) and other Unicode
	const decodedSlug = decodeURIComponent(params.slug);
	const safeSlug = sanitizeSlug(decodedSlug);
	if (!safeSlug.length || safeSlug.length > MAX_SLUG_LENGTH) {
		throw error(404);
	}

	const bar = await bars.findOne({ slug: safeSlug });
	if (!bar) throw error(404);

	return {
		bar: {
			...bar,
			_id: bar._id.toString()
		},
		user: locals.user ?? null
	};
};
