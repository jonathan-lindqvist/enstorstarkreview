import { MongoClient } from 'mongodb';
import { env } from '$env/dynamic/private';

const mongoUri = env.MONGO_URI;

if (!mongoUri) {
	throw new Error('MONGO_URI is required');
}

const client = new MongoClient(mongoUri);
let startPromise: Promise<typeof client> | null = null;

export function start_mongo() {
	console.log('Starting mongo...');
	if (!startPromise) {
		startPromise = client.connect().then(async (connectedClient) => {
			const database = connectedClient.db('enstorstark');

			await database
				.collection('bars')
				.createIndex({ slug: 1 }, { unique: true, name: 'unique_bar_slug' });

			await database
				.collection('audit_logs')
				.createIndex(
					{ createdAt: 1 },
					{ expireAfterSeconds: 60 * 60 * 24 * 90, name: 'audit_ttl_90d' }
				);

			await database
				.collection('audit_logs')
				.createIndex(
					{ eventType: 1, outcome: 1, createdAt: -1 },
					{ name: 'audit_event_outcome_createdAt' }
				);

			await database
				.collection('login_rate_limits')
				.createIndex(
					{ updatedAt: 1 },
					{ expireAfterSeconds: 60 * 60 * 24 * 30, name: 'login_rate_limit_ttl_30d' }
				);

			return connectedClient;
		});
	}

	return startPromise;
}

export default client.db('enstorstark');
