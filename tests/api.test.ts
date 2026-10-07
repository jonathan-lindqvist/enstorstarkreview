import { expect, type APIResponse } from '@playwright/test';
import { readFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { ObjectId, type Collection } from 'mongodb';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import {
	apiPrivateImage,
	apiPrivateSlug,
	apiSlug,
	bars,
	fixtureImagePath,
	legacySlug,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	reviewImageDirectory,
	reviewRequestRateLimits,
	runId,
	sessions,
	test
} from './fixtures/reviews';

const json = { 'content-type': 'application/json' };
const validator = new Ajv2020({ strict: false });
addFormats(validator);
validator.addSchema(parse(readFileSync('openapi/v1.yaml', 'utf8')), 'contract');

const expectSchema = (name: string, value: unknown) => {
	const validate = validator.getSchema(`contract#/components/schemas/${name}`);
	if (!validate) throw new Error(`Unknown schema: ${name}`);
	expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
};

const expectProblem = async (response: APIResponse, status: number, code: string) => {
	expect(response.status()).toBe(status);
	expect(response.headers()['content-type']).toContain('application/problem+json');
	expect(response.headers()['cache-control']).toBe('no-store');
	const body = await response.json();
	expectSchema('Problem', body);
	expect(body).toMatchObject({ status, code });
	return body;
};

// Tests intentionally exhaust real quotas in the development/test database, then restore
// their state so other browser specs are not affected. Playwright runs with one worker.
const isolatedQuota = async <T>(collection: Collection, run: () => Promise<T>): Promise<T> => {
	const saved = await collection.find({}).toArray();
	try {
		await collection.deleteMany({});
		return await run();
	} finally {
		await collection.deleteMany({});
		if (saved.length) await collection.insertMany(saved);
	}
};

let token: string;
let auth: { authorization: string };
test.beforeAll(async ({ request }) => {
	await isolatedQuota(loginRateLimits, async () => {
		const response = await request.post('/api/v1/sessions', {
			headers: json,
			data: { username: publisherUsername, password: publisherPassword }
		});
		expect(response.status()).toBe(201);
		const body = await response.json();
		expectSchema('SessionCreated', body);
		token = body.token;
		auth = { authorization: `Bearer ${token}` };
	});
});
test.afterAll(async () => {
	if (token) await sessions.deleteOne({ _id: token });
});

const editableInput = (slug: string) => ({
	title: `API-recension ${runId}`,
	description: 'Ändrad via API:t.',
	location: `API-gatan ${runId}`,
	slug,
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
});

const withEditableReview = async (run: (slug: string) => Promise<void>) => {
	const original = await bars.findOne({ slug: apiPrivateSlug });
	if (!original) throw new Error('Missing API fixture');
	const id = new ObjectId();
	const slug = `api-edit-${id}`;
	await bars.insertOne({ ...original, _id: id, slug });
	try {
		await run(slug);
	} finally {
		const saved = await bars.findOne({ _id: id });
		await bars.deleteOne({ _id: id });
		if (saved?.image && saved.image !== apiPrivateImage) {
			await unlink(join(reviewImageDirectory, saved.image));
		}
	}
};

test('native client API: sign in, create, edit, publish, read', async ({ request }) => {
	const metadata = await (await request.get('/api/v1/review-metadata')).json();
	expect(metadata.barAttributes).toContainEqual({ key: 'quiz', label: 'Quiz' });

	// A production build without an Origin header, as a native client sends it.
	const signIn = await isolatedQuota(loginRateLimits, () =>
		request.post('/api/v1/sessions', {
			headers: json,
			data: { username: publisherUsername, password: publisherPassword }
		})
	);
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

test('public API response bodies conform to the contract', async ({ request }) => {
	for (const [path, schema] of [
		['/review-metadata', 'ReviewMetadata'],
		['/reviews', 'ReviewList'],
		[`/reviews/${legacySlug}`, 'Review'],
		[`/reviews/${legacySlug}/history`, 'ReviewHistory'],
		['/map', 'ReviewMap'],
		['/statistics', 'ReviewStatistics']
	]) {
		const response = await request.get(`/api/v1${path}`);
		expect(response.status()).toBe(200);
		expectSchema(schema, await response.json());
	}
});

test('requires bearer authentication before parsing protected writes', async ({ request }) => {
	const original = await bars.findOne({ slug: apiPrivateSlug });
	const credentials: Record<string, string>[] = [
		{},
		{ authorization: 'Bearer invalid' },
		{ cookie: `auth_session=${token}` }
	];
	for (const headers of credentials) {
		const options = { headers: { ...json, ...headers }, data: Buffer.from('{') };
		await expectProblem(await request.post('/api/v1/reviews', options), 401, 'unauthorized');
		await expectProblem(
			await request.put(`/api/v1/reviews/${apiPrivateSlug}`, options),
			401,
			'unauthorized'
		);
		await expectProblem(
			await request.post(`/api/v1/reviews/${apiPrivateSlug}/publication`, options),
			401,
			'unauthorized'
		);
		await expectProblem(await request.post('/api/v1/map/geocoding', options), 401, 'unauthorized');
		await expectProblem(await request.get('/api/v1/users', { headers }), 401, 'unauthorized');
	}
	expect(await bars.findOne({ slug: apiPrivateSlug })).toEqual(original);
});

test('keeps draft details, history, images, and cache validators private', async ({ request }) => {
	const detail = await request.get(`/api/v1/reviews/${apiPrivateSlug}`, { headers: auth });
	expect(detail.status()).toBe(200);
	expectSchema('Review', await detail.json());
	expect(detail.headers()['cache-control']).toBe('private, no-cache');
	expect(detail.headers()['vary']).toBe('Authorization');
	for (const path of [
		`/reviews/${apiPrivateSlug}`,
		`/reviews/${apiPrivateSlug}/history`,
		`/images/${apiPrivateImage}`
	]) {
		await expectProblem(
			await request.get(`/api/v1${path}`, {
				headers: { 'if-none-match': detail.headers()['etag'], cookie: `auth_session=${token}` }
			}),
			404,
			'not_found'
		);
	}
	const image = await request.get(`/api/v1/images/${apiPrivateImage}`, { headers: auth });
	expect(image.status()).toBe(200);
	expect(image.headers()['cache-control']).toBe('private, no-store');
	const anonymous = await (await request.get('/api/v1/reviews')).json();
	const authenticated = await (await request.get('/api/v1/reviews', { headers: auth })).json();
	expect(anonymous.reviews.map((review: { slug: string }) => review.slug)).not.toContain(
		apiPrivateSlug
	);
	expect(authenticated.reviews.map((review: { slug: string }) => review.slug)).toContain(
		apiPrivateSlug
	);
});

test('rejects expired and revoked sessions and exposes only usernames', async ({ request }) => {
	const current = await sessions.findOne({ _id: token });
	if (!current) throw new Error('Missing API session');
	const expired = `expired-${runId}`;
	const revoked = `revoked-${runId}`;
	await sessions.insertMany([
		{ ...current, _id: expired, expires_at: new Date(0) },
		{ ...current, _id: revoked }
	]);
	try {
		await expectProblem(
			await request.get('/api/v1/sessions/current', {
				headers: { authorization: `Bearer ${expired}` }
			}),
			401,
			'unauthorized'
		);
		const logout = await request.delete('/api/v1/sessions/current', {
			headers: { authorization: `Bearer ${revoked}` }
		});
		expect(logout.status()).toBe(204);
		expect(await sessions.findOne({ _id: revoked })).toBeNull();
		await expectProblem(
			await request.get('/api/v1/users', {
				headers: { authorization: `Bearer ${revoked}` }
			}),
			401,
			'unauthorized'
		);
		const response = await request.get('/api/v1/users', { headers: auth });
		const body = await response.json();
		expectSchema('UserList', body);
		for (const user of body.users) expect(Object.keys(user)).toEqual(['username']);
	} finally {
		await sessions.deleteMany({ _id: { $in: [expired, revoked] } });
	}
});

test('bounds anonymous input and counts malformed login attempts against the shared IP quota', async ({
	request
}) => {
	await isolatedQuota(loginRateLimits, async () => {
		await expectProblem(
			await request.post('/api/v1/sessions', {
				headers: json,
				data: 'x'.repeat(16 * 1024 + 1)
			}),
			413,
			'payload_too_large'
		);
		await expectProblem(
			await request.post('/api/v1/sessions', {
				headers: json,
				data: { username: publisherUsername, password: 'wrong-password' }
			}),
			401,
			'invalid_credentials'
		);
		for (let attempt = 0; attempt < 6; attempt++) {
			await expectProblem(
				await request.post('/api/v1/sessions', { headers: json, data: Buffer.from('{') }),
				400,
				'bad_request'
			);
		}
		const blocked = await request.post('/api/v1/sessions', {
			headers: json,
			data: { username: publisherUsername, password: publisherPassword }
		});
		await expectProblem(blocked, 429, 'rate_limited');
		expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
	});
});

test('counts malformed review requests before any delivery can occur', async ({ request }) => {
	await isolatedQuota(reviewRequestRateLimits, async () => {
		for (let attempt = 0; attempt < 5; attempt++) {
			await expectProblem(
				await request.post('/api/v1/review-requests', {
					headers: json,
					data: Buffer.from('{')
				}),
				400,
				'bad_request'
			);
		}
		const blocked = await request.post('/api/v1/review-requests', { headers: json, data: '{}' });
		await expectProblem(blocked, 429, 'rate_limited');
		expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
	});
});

test('rejects a chunked oversized body before the client finishes sending it', async ({
	baseURL
}) => {
	await isolatedQuota(loginRateLimits, async () => {
		await new Promise<void>((resolve, reject) => {
			const outgoing = httpRequest(
				new URL('/api/v1/sessions', baseURL),
				{
					method: 'POST',
					headers: { ...json, 'transfer-encoding': 'chunked' }
				},
				(incoming) => {
					const chunks: Buffer[] = [];
					incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
					incoming.on('error', reject);
					incoming.on('end', () => {
						try {
							expect(incoming.statusCode).toBe(413);
							expect(incoming.headers.connection).toBe('close');
							const body = JSON.parse(Buffer.concat(chunks).toString());
							expectSchema('Problem', body);
							expect(body.code).toBe('payload_too_large');
							resolve();
						} catch (error) {
							reject(error);
						} finally {
							outgoing.destroy();
						}
					});
				}
			);
			outgoing.on('error', reject);
			outgoing.setTimeout(5000, () => outgoing.destroy(new Error('No early 413 response')));
			// Deliberately leave the request open; admission must not await the full body.
			outgoing.write(Buffer.alloc(17 * 1024, 0x61));
		});
	});
});

test('rejects wildcard, weak, absent, and stale edit versions without changing the review', async ({
	request
}) => {
	await withEditableReview(async (slug) => {
		const detail = await request.get(`/api/v1/reviews/${slug}`, { headers: auth });
		const tag = detail.headers()['etag'];
		const original = await bars.findOne({ slug });
		for (const [header, status, code] of [
			[undefined, 428, 'precondition_required'],
			['*', 412, 'precondition_failed'],
			[`*, ${tag}`, 412, 'precondition_failed'],
			[`W/${tag}`, 412, 'precondition_failed'],
			['"stale"', 412, 'precondition_failed']
		] as const) {
			await expectProblem(
				await request.put(`/api/v1/reviews/${slug}`, {
					headers: { ...json, ...auth, ...(header ? { 'if-match': header } : {}) },
					data: editableInput(slug)
				}),
				status,
				code
			);
			expect(await bars.findOne({ slug })).toEqual(original);
		}
		const updated = await request.put(`/api/v1/reviews/${slug}`, {
			headers: { ...json, ...auth, 'if-match': `"older", ${tag}` },
			data: editableInput(slug)
		});
		expect(updated.status()).toBe(200);
		expectSchema('Review', await updated.json());
		expect(updated.headers()['etag']).not.toBe(tag);
		await expectProblem(
			await request.put(`/api/v1/reviews/${slug}`, {
				headers: { ...json, ...auth, 'if-match': tag },
				data: editableInput(slug)
			}),
			412,
			'precondition_failed'
		);
	});
});

test('retains weak cache validation for public and authenticated reads', async ({ request }) => {
	for (const headers of [{}, auth]) {
		const detail = await request.get(`/api/v1/reviews/${legacySlug}`, { headers });
		for (const tag of ['*', `W/${detail.headers()['etag']}`]) {
			const cached = await request.get(`/api/v1/reviews/${legacySlug}`, {
				headers: { ...headers, 'if-none-match': tag }
			});
			expect(cached.status()).toBe(304);
			expect(await cached.body()).toHaveLength(0);
			expect(cached.headers()['vary']).toBe('Authorization');
		}
	}
});

test('rejects invalid authors, ratings, image data, and publication-status injection', async ({
	request
}) => {
	await withEditableReview(async (slug) => {
		const original = await bars.findOne({ slug });
		const detail = await request.get(`/api/v1/reviews/${slug}`, { headers: auth });
		for (const change of [
			{ authors: [] },
			{ authors: ['nonexistent-reviewer'] },
			{ publicationStatus: 'published' },
			{ ratings: { ...editableInput(slug).ratings, atmosphere: 2.5 } },
			{ image: { contentType: 'image/png', data: 'bad!base64' } },
			{ image: { contentType: 'image/png', data: Buffer.from('not-a-png').toString('base64') } }
		]) {
			await expectProblem(
				await request.put(`/api/v1/reviews/${slug}`, {
					headers: { ...json, ...auth, 'if-match': detail.headers()['etag'] },
					data: { ...editableInput(slug), ...change }
				}),
				422,
				'validation_failed'
			);
			expect(await bars.findOne({ slug })).toEqual(original);
		}
	});
});

test('accepts a valid multi-megabyte image through the full API workflow', async ({ request }) => {
	await withEditableReview(async (slug) => {
		const detail = await request.get(`/api/v1/reviews/${slug}`, { headers: auth });
		const image = await readFile(fixtureImagePath);
		// PNG decoders ignore trailing bytes after IEND; re-encoding strips this padding.
		const padded = Buffer.concat([
			image,
			Buffer.alloc(Math.max(0, 4 * 1024 * 1024 - image.length))
		]);
		const response = await request.put(`/api/v1/reviews/${slug}`, {
			headers: { ...json, ...auth, 'if-match': detail.headers()['etag'] },
			data: {
				...editableInput(slug),
				image: { contentType: 'image/png', data: padded.toString('base64') }
			}
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expectSchema('Review', body);
		const download = await request.get(body.image.url, { headers: auth });
		expect(download.status()).toBe(200);
		expect((await download.body()).length).toBeLessThan(padded.length);
	});
});

test('publication is one-way and preserves credited authors', async ({ request }) => {
	await withEditableReview(async (slug) => {
		const original = await bars.findOne({ slug });
		const response = await request.post(`/api/v1/reviews/${slug}/publication`, { headers: auth });
		expect(response.status()).toBe(200);
		expectSchema('Review', await response.json());
		expect(await bars.findOne({ slug })).toMatchObject({
			publicationStatus: 'published',
			author: original?.author,
			coAuthors: original?.coAuthors
		});
		await expectProblem(
			await request.post(`/api/v1/reviews/${slug}/publication`, {
				headers: auth
			}),
			409,
			'already_published'
		);
	});
});

test('unknown API paths and unreferenced images reveal no resource data', async ({ request }) => {
	await expectProblem(await request.get('/api/v1/does-not-exist'), 404, 'not_found');
	await expectProblem(
		await request.get(`/api/v1/images/${new ObjectId()}.png`, { headers: auth }),
		404,
		'not_found'
	);
});
