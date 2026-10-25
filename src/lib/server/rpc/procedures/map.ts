import { z } from 'zod';
import { authenticated, base } from '../base';
import { problems } from '../errors';
import { toApiReviewMap } from '../representations';
import { unvalidated } from '../schema-docs';
import { ReviewMap } from '../schemas';

export const getMap = base
	.meta({ auth: 'none', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/map',
		tags: ['Map'],
		operationId: 'getMap',
		summary: 'Get map markers for published reviews with known coordinates.',
		description:
			"Coordinates come from the server's geocode cache. A review without a resolved address\nhas no marker. Clients must never send the device location to this API.\n",
		successDescription: 'Map markers.'
	})
	.output(unvalidated(ReviewMap))
	.handler(async ({ context }) => toApiReviewMap(await context.deps.map.getData()));

/** Only reviewers may trigger geocoding; anonymous readers only see cached markers. */
export const resolveNextMapMarker = base
	.meta({ auth: 'required' })
	.route({
		method: 'POST',
		path: '/map/geocoding',
		outputStructure: 'detailed',
		tags: ['Map'],
		operationId: 'resolveNextMapMarker',
		summary: 'Geocode at most one published review address that has no marker.',
		description:
			'Reviewers call this after the map is shown. The server makes at most one address\nattempt per call and returns 204 when there is nothing to do or another attempt is\nactive.\n'
	})
	.errors(problems('unauthorized'))
	.use(authenticated())
	.output(
		unvalidated(
			z.union([
				z.object({
					status: z.literal(200).meta({
						description: 'A new marker was resolved. Returns the updated map.'
					}),
					body: ReviewMap
				}),
				z.object({ status: z.literal(204).meta({ description: 'No marker was resolved.' }) })
			])
		)
	)
	.handler(async ({ context }) => {
		const marker = await context.deps.map.resolveOneMarker();
		if (!marker) return { status: 204 as const };
		return { status: 200 as const, body: toApiReviewMap(await context.deps.map.getData()) };
	});
