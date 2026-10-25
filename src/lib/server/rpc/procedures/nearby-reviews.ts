import { z } from 'zod';
import { MAX_SHORT_TEXT } from '$lib/constants';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { parseRouteSlug } from '$lib/server/reviews/route-slug';
import { authenticated, base } from '../base';
import { problem, problems } from '../errors';
import { apiInput } from '../input';
import { toApiNearbyReviews } from '../nearby-reviews';
import { doc, unvalidated } from '../schema-docs';
import { NearbyReviews } from '../schemas';

const INVALID_ADDRESS = 'Ange en adress på högst 300 tecken.';

/**
 * The web form's nearby comparison for one address. Counts include drafts, so a token is
 * required before anything is read. The center is a saved position; the server never geocodes.
 */
export const getNearbyReviews = base
	.meta({ auth: 'required' })
	.route({
		method: 'GET',
		path: '/nearby-reviews',
		tags: ['Reviews'],
		operationId: 'getNearbyReviews',
		summary: 'Count reviewed bars near an address, for the barhop rating.',
		description:
			"The same comparison as the web review form, beside the barhop rating. The center is the\nsaved position of another review with the same address (compared case-insensitively\nafter whitespace cleanup); the server never geocodes a new address and never accepts a\ndevice location. Counts include drafts, so the endpoint requires a token. When editing,\npass the review's slug as `exclude`: that review is left out of the counts, but its own\nsaved address can still be the center. Distances are approximate, as the crow flies.\n",
		successDescription: 'The comparison.'
	})
	.errors(problems('bad_request', 'unauthorized', 'not_found', 'service_unavailable'))
	.use(authenticated())
	.input(
		apiInput({
			query: z.object({
				address: doc(
					z
						.string({ error: INVALID_ADDRESS })
						.min(1, INVALID_ADDRESS)
						.max(MAX_SHORT_TEXT, INVALID_ADDRESS)
						.refine((address) => address.trim().length > 0, INVALID_ADDRESS),
					{ description: 'The address entered in the form. Give it exactly once.' }
				),
				exclude: doc(z.string({ error: 'Ange högst en recension att utesluta.' }).optional(), {
					description: 'Slug of the review being edited. Give it at most once.'
				})
			})
		})
	)
	.output(unvalidated(NearbyReviews))
	.handler(async ({ input, context }) => {
		const { address, exclude } = input.query;
		let excludeId;
		if (exclude !== undefined) {
			const slug = parseRouteSlug(exclude);
			if (!slug) throw problem('bad_request', 'Ogiltig recension att utesluta.');
			const review = await context.deps.reviews.findOne({
				$and: [{ slug }, ACTIVE_REVIEW_FILTER]
			});
			if (!review) throw problem('not_found', 'Recensionen hittades inte');
			excludeId = review._id;
		}

		const comparison = await context.deps.reviews.loadNearbyComparison(excludeId);
		if (!comparison.available) {
			throw problem('service_unavailable', 'Jämförelsen kunde inte laddas just nu.');
		}
		return toApiNearbyReviews(address, comparison);
	});
