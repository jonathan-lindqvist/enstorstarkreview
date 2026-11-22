import { apiHandler } from '$lib/server/api/http';
import { reviewImageResponse } from '$lib/server/api/images';
import { reviewImageReadDependencies } from '$lib/server/reviews/image-read-dependencies';

export const GET = apiHandler((event) =>
	reviewImageResponse(
		event.params.filename,
		Boolean(event.locals.user),
		event.url.searchParams.getAll('preview'),
		reviewImageReadDependencies
	)
);
