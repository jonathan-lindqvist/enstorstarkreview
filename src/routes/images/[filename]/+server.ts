import type { RequestHandler } from '@sveltejs/kit';
import { isProcedureError } from '$lib/server/rpc/errors';
import { webClient, webQuery } from '$lib/server/rpc/web';

const MESSAGES: Record<number, string> = {
	400: 'Ogiltig bildförhandsvisning',
	404: 'Bilden finns inte'
};

export const GET: RequestHandler = async (event) => {
	let image;
	try {
		image = await webClient(event).images.get({
			params: { filename: event.params.filename ?? '' },
			query: webQuery(event.url)
		});
	} catch (cause) {
		if (!isProcedureError(cause)) throw cause;
		// Web image failures are short plain-text responses; the API door renders problems.
		return new Response(MESSAGES[cause.status] ?? 'Kunde inte läsa bilden', {
			status: cause.status,
			headers: { 'cache-control': 'no-store', ...cause.data?.headers }
		});
	}

	return new Response(image.body, {
		headers: {
			'cache-control': image.headers['cache-control'],
			'content-type': image.body.type
		}
	});
};
