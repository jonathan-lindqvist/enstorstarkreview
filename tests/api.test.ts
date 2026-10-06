import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
	apiSlug,
	fixtureImagePath,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';

const json = { 'content-type': 'application/json' };

test('native client API: sign in, create, edit, publish, read', async ({ request }) => {
	const metadata = await (await request.get('/api/v1/review-metadata')).json();
	expect(metadata.barAttributes).toContainEqual({ key: 'quiz', label: 'Quiz' });

	// A production build without an Origin header, as a native client sends it.
	const signIn = await request.post('/api/v1/sessions', {
		headers: json,
		data: { username: publisherUsername, password: publisherPassword }
	});
	expect(signIn.status()).toBe(201);
	const auth = { authorization: `Bearer ${(await signIn.json()).token}` };

	const input = {
		title: `API-recension ${runId}`,
		description: 'Skapad via API:t.',
		location: `API-gatan ${runId}`,
		slug: apiSlug,
		ratings: {
			atmosphere: 4,
			service: 4,
			selection: 3,
			quality: 5,
			price: 3,
			cleanliness: 4,
			soundLevel: 2,
			barhopPotential: 5
		},
		beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: true },
		authors: [publisherUsername],
		imageFocus: { x: 30, y: 60 }
	};

	const created = await request.post('/api/v1/reviews', {
		headers: { ...json, ...auth },
		data: {
			...input,
			attributes: ['quiz', 'darts'],
			image: {
				contentType: 'image/png',
				data: (await readFile(fixtureImagePath)).toString('base64')
			}
		}
	});
	expect(created.status()).toBe(201);
	expect(await created.json()).toMatchObject({
		slug: apiSlug,
		publicationStatus: 'draft',
		attributes: ['quiz', 'darts']
	});
	expect((await request.get(`/api/v1/reviews/${apiSlug}`)).status()).toBe(404);

	const updated = await request.put(`/api/v1/reviews/${apiSlug}`, {
		headers: { ...json, ...auth, 'if-match': created.headers()['etag'] },
		data: { ...input, description: 'Ändrad via API:t.' }
	});
	expect(updated.status()).toBe(200);

	const published = await request.post(`/api/v1/reviews/${apiSlug}/publication`, {
		headers: auth
	});
	expect(published.status()).toBe(200);

	const review = await request.get(`/api/v1/reviews/${apiSlug}`);
	const body = await review.json();
	// The edit omitted `attributes`, so the review keeps them.
	expect(body).toMatchObject({
		description: 'Ändrad via API:t.',
		publicationStatus: 'published',
		attributes: ['quiz', 'darts']
	});
	expect((await request.get(body.image.url)).status()).toBe(200);
});
