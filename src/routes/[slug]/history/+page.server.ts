import type { PageServerLoad } from './$types';
import { webClient, webError } from '$lib/server/rpc/web';

export const load: PageServerLoad = async (event) => {
	let history;
	try {
		history = await webClient(event).reviews.history({ params: { slug: event.params.slug } });
	} catch (cause) {
		return webError(cause);
	}

	return {
		bar: { title: history.title, slug: history.slug },
		history: history.entries.map((entry, index) => ({ id: `${history.slug}-${index}`, ...entry }))
	};
};
