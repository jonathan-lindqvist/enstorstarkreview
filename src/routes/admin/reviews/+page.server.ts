import { redirect } from '@sveltejs/kit';
import { ReviewStore } from '$lib/server/reviews/store';
import { serializeReview } from '$lib/server/reviews/serialization';
import { runWeb } from '$lib/server/web';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(302, '/login');

	const bars = await runWeb(
		event,
		ReviewStore.use((store) => store.findActive())
	);
	return {
		username: event.locals.user.username,
		bars: bars.map((bar) => serializeReview(bar))
	};
};
