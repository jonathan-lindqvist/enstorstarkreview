import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	MONGO_URI: {
		schema: (input) => {
			if (!input) throw new Error('MONGO_URI is required');
			return input;
		}
	},
	// Delivery owns the production requirement; development can use its local sink.
	REVIEW_REQUEST_DISCORD_WEBHOOK_URL: { schema: (input) => input }
});
