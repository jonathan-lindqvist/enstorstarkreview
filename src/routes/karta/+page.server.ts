import type { PageServerLoad } from './$types';
import { getPublicReviewMapData } from '#lib/server/review-map.js';
import { normalizeBarAttributes } from '#lib/bar-attributes.js';

export const load: PageServerLoad = async ({ url }) => ({
	attributes: normalizeBarAttributes(url.searchParams.getAll('attributes')),
	map: await getPublicReviewMapData()
});
