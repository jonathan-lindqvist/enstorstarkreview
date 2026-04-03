import { MongoClient } from 'mongodb';
import { MONGO_URI } from '$env/static/private';

const client = new MongoClient(MONGO_URI);
let startPromise: Promise<typeof client> | null = null;

export function start_mongo() {
	console.log('Starting mongo...');
	if (!startPromise) {
		startPromise = client.connect().then(async (connectedClient) => {
			await connectedClient
				.db('enstorstark')
				.collection('bars')
				.createIndex({ slug: 1 }, { unique: true, name: 'unique_bar_slug' });
			return connectedClient;
		});
	}

	return startPromise;
}

export default client.db('enstorstark');
