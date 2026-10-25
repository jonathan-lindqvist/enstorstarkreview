import {
	readReviewImage,
	type ReviewImageReadDependencies
} from '$lib/server/review-image-response';
import { internalErrorProblem, notFoundProblem, problem } from './problem';

const invalidPreviewProblem = () => problem(400, 'bad_request', 'Ogiltig bildförhandsvisning.');

/**
 * The `/api/v1/images` response for one review image: the original or a single preview,
 * authorized through its review, with failures as problem responses.
 */
export const reviewImageResponse = async (
	filename: string | undefined,
	isAuthenticated: boolean,
	previews: string[],
	deps: ReviewImageReadDependencies
): Promise<Response> => {
	if (previews.length > 1) return invalidPreviewProblem();

	const image = await readReviewImage(filename, isAuthenticated, deps, previews[0] ?? null);
	if (!image.ok) {
		if (image.status === 400) return invalidPreviewProblem();
		if (image.status === 404) return notFoundProblem();
		if (image.status === 503) {
			return problem(503, 'service_unavailable', 'Försök igen om en stund.', {
				headers: { 'retry-after': '1' }
			});
		}
		return internalErrorProblem();
	}

	return new Response(image.body, {
		headers: {
			'cache-control': image.cacheControl,
			'content-type': image.contentType,
			vary: 'Authorization'
		}
	});
};
