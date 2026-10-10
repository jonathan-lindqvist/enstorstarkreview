import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
	auditLogs,
	bars,
	fixtureImagePath,
	isolatedQuota,
	legacySlug,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	reviewImageDirectory,
	runId,
	sessions,
	test
} from './fixtures/reviews';

const json = { 'content-type': 'application/json' };
const deletedSlug = `playwright-borttagen-${runId}`;
const deletedDraftSlug = `playwright-borttaget-utkast-${runId}`;
const deletedTitle = `Borttagen bar ${runId}`;
const deletedImage = `${new ObjectId().toHexString()}.png`;
const deleteMeSlug = `playwright-ta-bort-${runId}`;

let token: string;
let bearer: { authorization: string };
let cookie: { cookie: string };

test.beforeAll(async ({ request }) => {
	await copyFile(fixtureImagePath, join(reviewImageDirectory, deletedImage));
	const legacy = await bars.findOne({ slug: legacySlug });
	if (!legacy) throw new Error('Missing legacy review fixture');
	const deletedAt = new Date();
	await bars.insertMany([
		{
			...legacy,
			_id: new ObjectId(),
			slug: deletedSlug,
			title: deletedTitle,
			image: deletedImage,
			publicationStatus: 'published',
			deletedAt,
			deletedBy: 'test'
		},
		{
			...legacy,
			_id: new ObjectId(),
			slug: deletedDraftSlug,
			title: `${deletedTitle} utkast`,
			image: deletedImage,
			publicationStatus: 'draft',
			deletedAt,
			deletedBy: 'test'
		}
	]);

	await isolatedQuota(loginRateLimits, async () => {
		const response = await request.post('/api/v1/sessions', {
			headers: json,
			data: { username: publisherUsername, password: publisherPassword }
		});
		expect(response.status()).toBe(201);
		token = (await response.json()).token;
	});
	bearer = { authorization: `Bearer ${token}` };
	// The web session cookie carries the same Lucia session id as the API bearer token.
	cookie = { cookie: `auth_session=${token}` };
});

test.afterAll(async () => {
	await bars.deleteMany({ slug: { $in: [deletedSlug, deletedDraftSlug, deleteMeSlug] } });
	await auditLogs.deleteMany({ targetSlug: deleteMeSlug });
	if (token) await sessions.deleteOne({ _id: token });
	await unlink(join(reviewImageDirectory, deletedImage)).catch(() => undefined);
});

test('deleted reviews are hidden from anonymous visitors everywhere', async ({ request }) => {
	for (const path of [`/${deletedSlug}`, `/${deletedSlug}/history`, `/images/${deletedImage}`]) {
		expect((await request.get(path)).status(), path).toBe(404);
	}
	expect(await (await request.get('/')).text()).not.toContain(deletedSlug);
	expect(await (await request.get('/feed.xml')).text()).not.toContain(deletedTitle);

	expect((await request.get(`/api/v1/reviews/${deletedSlug}`)).status()).toBe(404);
	expect((await request.get(`/api/v1/reviews/${deletedSlug}/history`)).status()).toBe(404);
	expect((await request.get(`/api/v1/images/${deletedImage}`)).status()).toBe(404);
	const list = await (
		await request.get(`/api/v1/reviews?search=${encodeURIComponent(deletedTitle)}`)
	).json();
	expect(JSON.stringify(list)).not.toContain(deletedSlug);
});

test('deleted reviews are hidden from signed-in users and cannot be changed', async ({
	request
}) => {
	for (const slug of [deletedSlug, deletedDraftSlug]) {
		for (const path of [`/${slug}`, `/${slug}/history`, `/${slug}/edit`]) {
			const response = await request.get(path, { headers: cookie, maxRedirects: 0 });
			expect(response.status(), path).toBe(404);
		}
		expect((await request.get(`/api/v1/reviews/${slug}`, { headers: bearer })).status()).toBe(404);
		expect(
			(await request.get(`/api/v1/reviews/${slug}/history`, { headers: bearer })).status()
		).toBe(404);
	}
	expect((await request.get(`/images/${deletedImage}`, { headers: cookie })).status()).toBe(404);
	expect((await request.get(`/api/v1/images/${deletedImage}`, { headers: bearer })).status()).toBe(
		404
	);

	const adminList = await request.get('/admin/reviews', { headers: cookie, maxRedirects: 0 });
	expect(adminList.status()).toBe(200);
	expect(await adminList.text()).not.toContain(deletedSlug);
	const home = await request.get('/', { headers: cookie });
	expect(await home.text()).not.toContain(deletedSlug);
	const list = await (
		await request.get(`/api/v1/reviews?search=${encodeURIComponent(deletedTitle)}`, {
			headers: bearer
		})
	).json();
	expect(JSON.stringify(list)).not.toContain(deletedSlug);

	const before = await bars.findOne({ slug: deletedDraftSlug });
	const publish = await request.post(`/api/v1/reviews/${deletedDraftSlug}/publication`, {
		headers: bearer
	});
	expect(publish.status()).toBe(404);
	const update = await request.put(`/api/v1/reviews/${deletedDraftSlug}`, {
		headers: { ...bearer, ...json, 'if-match': '"any"' },
		data: {
			title: deletedTitle,
			description: 'Ska aldrig sparas.',
			location: 'Borttagna gatan 1',
			slug: deletedDraftSlug,
			ratings: {
				atmosphere: 4,
				service: 4,
				selection: 4,
				quality: 4,
				price: 4,
				cleanliness: 4,
				soundLevel: 4,
				barhopPotential: 4
			},
			beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: false },
			authors: [publisherUsername],
			imageFocus: { x: 50, y: 50 }
		}
	});
	expect(update.status()).toBe(404);
	const after = await bars.findOne({ slug: deletedDraftSlug });
	expect(after?.publicationStatus).toBe('draft');
	expect(after?.updatedAt).toEqual(before?.updatedAt);
});

test('signed-in users soft-delete a review from the detail page', async ({ request, baseURL }) => {
	const legacy = await bars.findOne({ slug: legacySlug });
	if (!legacy) throw new Error('Missing legacy review fixture');
	const id = new ObjectId();
	await bars.insertOne({
		...legacy,
		_id: id,
		slug: deleteMeSlug,
		title: `Ta bort mig ${runId}`,
		publicationStatus: 'published'
	});
	const deleteAction = (headers: Record<string, string> = {}) =>
		request.post(`/${deleteMeSlug}?/delete`, {
			headers: { origin: baseURL ?? '', accept: 'text/html', ...headers },
			form: {},
			maxRedirects: 0
		});

	expect((await deleteAction()).status()).toBe(401);
	expect(await bars.findOne({ _id: id })).not.toHaveProperty('deletedAt');
	expect(
		await auditLogs.countDocuments({
			eventType: 'review_delete',
			outcome: 'denied',
			targetSlug: deleteMeSlug
		})
	).toBe(1);

	const deleted = await deleteAction(cookie);
	expect(deleted.status()).toBe(303);
	expect(deleted.headers().location).toBe('/admin/reviews?borttagen=1');

	const stored = await bars.findOne({ _id: id });
	expect(stored?.deletedAt).toBeInstanceOf(Date);
	expect(stored).toMatchObject({ deletedBy: publisherUsername, publicationStatus: 'published' });
	expect(stored?.changeLog.at(-1)).toMatchObject({
		updatedBy: publisherUsername,
		changes: [{ field: 'deletedAt', label: 'Status', before: 'Publicerad', after: 'Borttagen' }]
	});
	expect((await request.get(`/${deleteMeSlug}`)).status()).toBe(404);
	expect(
		await auditLogs.countDocuments({
			eventType: 'review_delete',
			outcome: 'success',
			username: publisherUsername,
			targetSlug: deleteMeSlug
		})
	).toBe(1);

	expect((await deleteAction(cookie)).status()).toBe(404);
	expect((await bars.findOne({ _id: id }))?.deletedAt).toEqual(stored?.deletedAt);
});
