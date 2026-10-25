import { normalizeBarAttributes } from '$lib/bar-attributes';
import { ReviewMap } from '$lib/server/map/service';
import { runWeb } from '$lib/server/web';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	attributes: normalizeBarAttributes(event.url.searchParams.getAll('attributes')),
	map: await runWeb(
		event,
		ReviewMap.use((map) => map.get)
	)
});
