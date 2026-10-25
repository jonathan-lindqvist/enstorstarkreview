import { base } from '../base';
import { unvalidated } from '../schema-docs';
import { ReviewStatistics } from '../schemas';

export const getStatistics = base
	.meta({ auth: 'none', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/statistics',
		tags: ['Statistics'],
		operationId: 'getStatistics',
		summary: 'Get statistics for published reviews.',
		successDescription: 'Statistics.'
	})
	.output(unvalidated(ReviewStatistics))
	.handler(async ({ context }) => {
		// The price chart points are web-only and not part of the API contract.
		const { priceComparison: _priceComparison, ...statistics } =
			await context.deps.statistics.get();
		return statistics;
	});
