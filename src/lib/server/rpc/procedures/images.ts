import { z } from 'zod';
import { REVIEW_IMAGE_PREVIEW_WIDTHS } from '$lib/review-image-previews';
import { readReviewImage } from '$lib/server/review-image-response';
import type { ReviewImagePreview } from '$lib/types/review-image';
import { base } from '../base';
import { notFound, problem, problems } from '../errors';
import { apiInput } from '../input';
import { doc, problemResponse, unvalidated } from '../schema-docs';

const INVALID_PREVIEW = 'Ogiltig bildförhandsvisning.';
const PREVIEWS = Object.keys(REVIEW_IMAGE_PREVIEW_WIDTHS) as [
	ReviewImagePreview,
	...ReviewImagePreview[]
];

const imageContent = (type: string) => ({
	schema: { type: 'string' as const, contentMediaType: type }
});

/**
 * One review image, the original or a single preview, authorized through the review that
 * references it. Unknown and unauthorized files are both not found.
 */
export const getImage = base
	.meta({ auth: 'optional' })
	.route({
		method: 'GET',
		path: '/images/{filename}',
		outputStructure: 'detailed',
		tags: ['Images'],
		operationId: 'getImage',
		summary: 'Download a review photo.',
		description:
			'Use the `image.url` of a review instead of building this path. Images of drafts need\nauthentication. Published images are immutable and can be cached forever.\n\nWithout `preview`, the response is the original upload, which can be several megabytes\nand tens of megapixels. Lists and detail screens should request a preview: a WebP scaled\nto at most 768 (`card-v1`) or 1280 (`detail-v1`) pixels wide, never enlarged. A preview\nhas the same access rules and cache headers as the original.\n',
		spec: (operation) => ({
			...operation,
			responses: {
				...operation.responses,
				'200': {
					description: 'The image bytes. A preview is always `image/webp`.',
					content: {
						'image/jpeg': imageContent('image/jpeg'),
						'image/png': imageContent('image/png'),
						'image/webp': imageContent('image/webp')
					}
				},
				'400': problemResponse('The `preview` value is unknown or given more than once.'),
				'503': problemResponse(
					'Too many previews are being generated. Retry after the given time.',
					{ 'Retry-After': { $ref: '#/components/headers/RetryAfter' } }
				)
			}
		})
	})
	.errors(problems('bad_request', 'not_found', 'service_unavailable'))
	.input(
		apiInput({
			params: z.object({
				filename: doc(z.string(), { pattern: '^[0-9a-f]{24}\\.(jpe?g|png|webp)$' })
			}),
			query: z.object({
				preview: doc(z.enum(PREVIEWS, { error: INVALID_PREVIEW }).optional(), {
					description: 'Give at most once. Any other value is `400` with code `bad_request`.'
				})
			})
		})
	)
	.output(
		unvalidated(
			z.object({
				headers: z.object({ 'cache-control': z.string(), vary: z.string() }),
				body: z.instanceof(Blob)
			})
		)
	)
	.handler(async ({ input, context }) => {
		const image = await readReviewImage(
			input.params.filename,
			Boolean(context.user),
			context.deps.images,
			input.query.preview ?? null
		);
		if (!image.ok) {
			if (image.status === 400) throw problem('bad_request', INVALID_PREVIEW);
			if (image.status === 404) throw notFound();
			if (image.status === 503) {
				throw problem('service_unavailable', 'Försök igen om en stund.', {
					headers: { 'retry-after': '1' }
				});
			}
			throw problem('internal_error', 'Kunde inte läsa bilden');
		}
		return {
			headers: { 'cache-control': image.cacheControl, vary: 'Authorization' },
			body: new Blob([image.body], { type: image.contentType })
		};
	});
