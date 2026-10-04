import type { PageServerLoad } from './$types';
import { getPublicReviewMapData } from '$lib/server/review-map';
import { normalizeBarAttributes } from '$lib/bar-attributes';

export const load: PageServerLoad = async ({ url }) => ({
	attributes: normalizeBarAttributes(url.searchParams.getAll('attributes')),
	map: await getPublicReviewMapData()
});
