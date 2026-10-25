import { authenticated, base } from '../base';
import { problems } from '../errors';
import { buildReviewMetadata } from '../metadata';
import { unvalidated } from '../schema-docs';
import { ReviewMetadata, UserList } from '../schemas';

export const getReviewMetadata = base
	.meta({ auth: 'none', cache: 'revalidate' })
	.route({
		method: 'GET',
		path: '/review-metadata',
		tags: ['Metadata'],
		operationId: 'getReviewMetadata',
		summary: 'Rating aspects, overall-rating rules, beer brands and input limits.',
		description: 'Clients render rating labels and build the review form from this data.',
		successDescription: 'Review metadata.'
	})
	.output(unvalidated(ReviewMetadata))
	.handler(() => buildReviewMetadata());

export const listUsers = base
	.meta({ auth: 'required' })
	.route({
		method: 'GET',
		path: '/users',
		tags: ['Metadata'],
		operationId: 'listUsers',
		summary: 'List reviewer usernames for the author picker.',
		successDescription: 'Reviewers, sorted with Swedish collation.'
	})
	.errors(problems('unauthorized'))
	.use(authenticated())
	.output(unvalidated(UserList))
	.handler(async ({ context }) => {
		const usernames = await context.deps.users.listUsernames();
		return {
			users: usernames
				.toSorted((first, second) => first.localeCompare(second, 'sv'))
				.map((username) => ({ username }))
		};
	});
