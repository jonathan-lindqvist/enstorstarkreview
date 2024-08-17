import { start_mongo } from '$lib/db/db';

start_mongo()
	.then(() => {
		console.log('Mongo started');
	})
	.catch((error) => {
		console.error(error);
	});
