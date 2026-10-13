import { expect } from '@playwright/test';
import {
	apiPrivateImage,
	bars,
	fixtureImagePath,
	isolatedQuota,
	legacyImage,
	legacySlug,
	legacyTitle,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	reviewImageDirectory,
	runId,
	test
} from './fixtures/reviews';
import { expectImagePosition, expectSquare, login } from './fixtures/browser';
import sharp from 'sharp';
import { copyFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';

test('serves compact previews with the same image access rules', async ({ page, request }) => {
	const original = await request.get(`/images/${legacyImage}`);
	const preview = await request.get(`/images/${legacyImage}?preview=card-v1`);
	expect(preview.status()).toBe(200);
	expect(preview.headers()['content-type']).toBe('image/webp');
	expect(preview.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
	expect((await preview.body()).length).toBeLessThan((await original.body()).length / 2);
	expect((await sharp(await preview.body()).metadata()).width).toBeLessThanOrEqual(768);
	const invalid = await request.get(`/images/${legacyImage}?preview=100000`);
	expect(invalid.status()).toBe(400);
	expect(invalid.headers()['cache-control']).toBe('no-store');
	expect(
		(await request.get(`/images/${legacyImage}?preview=card-v1&preview=detail-v1`)).status()
	).toBe(400);
	expect((await request.get(`/images/${new ObjectId()}.png?preview=card-v1`)).status()).toBe(404);

	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	const draft = await page.evaluate(async (path) => {
		const response = await fetch(path);
		return { status: response.status, cacheControl: response.headers.get('cache-control') };
	}, `/images/${apiPrivateImage}?preview=detail-v1`);
	expect(draft.status).toBe(200);
	expect(draft.cacheControl).toBe('private, no-store');
	// Authorization must still run when the preview is already on disk.
	expect((await request.get(`/images/${apiPrivateImage}?preview=detail-v1`)).status()).toBe(404);
});

test('authorizes a cached preview again after deletion or a visibility change', async ({
	page,
	request
}) => {
	const id = new ObjectId();
	const image = `${id}.png`;
	try {
		await copyFile(fixtureImagePath, join(reviewImageDirectory, image));
		const template = await bars.findOne({ slug: legacySlug });
		await bars.insertOne({
			...template,
			_id: id,
			slug: `image-visibility-${id}`,
			image,
			publicationStatus: 'published'
		});
		const path = `/images/${image}?preview=card-v1`;
		expect((await request.get(path)).status()).toBe(200);
		await bars.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
		const deleted = await request.get(path);
		expect(deleted.status()).toBe(404);
		expect(deleted.headers()['cache-control']).toBe('no-store');
		await bars.updateOne(
			{ _id: id },
			{ $unset: { deletedAt: '' }, $set: { publicationStatus: 'unknown' } }
		);
		expect((await request.get(path)).status()).toBe(404);
		await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
		const authenticated = await page.evaluate(async (source) => {
			const response = await fetch(source);
			return { status: response.status, cacheControl: response.headers.get('cache-control') };
		}, path);
		expect(authenticated).toEqual({ status: 200, cacheControl: 'private, no-store' });
	} finally {
		await bars.deleteOne({ _id: id });
		await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
		await unlink(join(reviewImageDirectory, 'previews', 'v1', `${image}.card-v1.webp`)).catch(
			() => undefined
		);
	}
});

for (const width of [375, 1280]) {
	test(`shows a detail preview before quietly upgrading at ${width}px`, async ({
		page,
		baseURL
	}, testInfo) => {
		await page
			.context()
			.addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
		await page.setViewportSize({ width, height: 844 });
		let release!: () => void;
		const ready = new Promise<void>((resolve) => (release = resolve));
		let originalRequested = false;
		await page.route(
			(url) => url.pathname === `/images/${legacyImage}` && !url.search,
			async (route) => {
				originalRequested = true;
				await ready;
				await route.fulfill({ contentType: 'image/png', body: await readFile(fixtureImagePath) });
			}
		);
		try {
			await page.goto(`/${legacySlug}`, { waitUntil: 'domcontentloaded' });
			const image = page.getByRole('img', { name: legacyTitle, exact: true });
			await expect(image).toHaveAttribute('src', `/images/${legacyImage}?preview=detail-v1`);
			await expect
				.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
				.toBeGreaterThan(0);
			await expectSquare(image);
			await expectImagePosition(image, '50% 50%');
			const before = await image.boundingBox();
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await page.screenshot({
					path: testInfo.outputPath(`preview-${theme}.png`),
					animations: 'disabled'
				});
			}
			await expect.poll(() => originalRequested).toBe(true);
			release();
			await expect(image).toHaveAttribute('src', `/images/${legacyImage}`);
			await expect
				.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete))
				.toBe(true);
			expect(await image.boundingBox()).toEqual(before);
			await expectImagePosition(image, '50% 50%');
		} finally {
			release();
		}
	});
}

test('upgrades only visible home photos, one original at a time', async ({
	page,
	baseURL
}, testInfo) => {
	await page.context().addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
	await page.setViewportSize({ width: 375, height: 844 });
	const template = await bars.findOne({ slug: legacySlug });
	expect(template).not.toBeNull();
	const ids = Array.from({ length: 6 }, () => new ObjectId());
	const images = ids.map((id) => `${id}.png`);
	const requested: string[] = [];
	let releaseFirst!: () => void;
	let releaseLast!: () => void;
	const firstReady = new Promise<void>((resolve) => (releaseFirst = resolve));
	const lastReady = new Promise<void>((resolve) => (releaseLast = resolve));
	try {
		await Promise.all(
			images.map((image) => copyFile(fixtureImagePath, join(reviewImageDirectory, image)))
		);
		await bars.insertMany(
			ids.map((id, index) => ({
				...template,
				_id: id,
				slug: `image-loading-${runId}-${index}`,
				title: `Bildladdning ${runId} ${index}`,
				image: images[index],
				createdAt: new Date(Date.now() - index * 1000)
			}))
		);
		await page.route(
			(url) => images.some((image) => url.pathname === `/images/${image}`) && !url.search,
			async (route) => {
				const filename = new URL(route.request().url()).pathname.split('/').at(-1)!;
				requested.push(filename);
				if (filename === images[0]) await firstReady;
				if (filename === images[5]) await lastReady;
				await route.fulfill({ contentType: 'image/png', body: await readFile(fixtureImagePath) });
			}
		);
		await page.goto(`/?search=${encodeURIComponent(`Bildladdning ${runId}`)}`, {
			waitUntil: 'domcontentloaded'
		});
		const photos = page.locator('main a img');
		const first = photos.first();
		const last = photos.last();
		await expect(photos).toHaveCount(6);
		await first.scrollIntoViewIfNeeded();
		await expect(first).toHaveAttribute('src', `/images/${images[0]}?preview=card-v1`);
		await expect.poll(() => requested).toEqual([images[0]]);
		await expect
			.poll(() => first.evaluate((element) => (element as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await page.screenshot({
				path: testInfo.outputPath(`home-${theme}.png`),
				animations: 'disabled'
			});
		}
		await last.scrollIntoViewIfNeeded();
		await expect
			.poll(() => last.evaluate((element) => (element as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		expect(requested).toEqual([images[0]]);
		releaseFirst();
		await expect.poll(() => requested.includes(images[5])).toBe(true);
		expect(requested).not.toContain(images[2]);
		releaseLast();
		await expect(last).toHaveAttribute('src', `/images/${images[5]}`);
		await page.setViewportSize({ width: 1280, height: 844 });
		await first.scrollIntoViewIfNeeded();
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await page.screenshot({
				path: testInfo.outputPath(`home-desktop-${theme}.png`),
				animations: 'disabled'
			});
		}
		await page.goto('/about');
	} finally {
		releaseFirst();
		releaseLast();
		await bars.deleteMany({ _id: { $in: ids } });
		for (const image of images) {
			await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
			await unlink(join(reviewImageDirectory, 'previews', 'v1', `${image}.card-v1.webp`)).catch(
				() => undefined
			);
		}
	}
});

test('keeps the preview when the original download fails', async ({ page }) => {
	await page.route(
		(url) => url.pathname === `/images/${legacyImage}` && !url.search,
		(route) => route.fulfill({ status: 500 })
	);
	const original = page.waitForRequest(
		(request) =>
			new URL(request.url()).pathname === `/images/${legacyImage}` && !new URL(request.url()).search
	);
	await page.goto(`/${legacySlug}`);
	await original;
	const image = page.getByRole('img', { name: legacyTitle, exact: true });
	await expect(image).toHaveAttribute('src', `/images/${legacyImage}?preview=detail-v1`);
	await expect
		.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
});

test('falls back to the original when its preview is unavailable', async ({ page }) => {
	await page.route(
		(url) => url.pathname === `/images/${legacyImage}` && url.searchParams.has('preview'),
		(route) => route.fulfill({ status: 503 })
	);
	await page.goto(`/${legacySlug}`);
	const image = page.getByRole('img', { name: legacyTitle, exact: true });
	await expect(image).toHaveAttribute('src', `/images/${legacyImage}`);
	await expect
		.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
});

test('renders useful previews without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(`/${legacySlug}`);
		const image = page.getByRole('img', { name: legacyTitle, exact: true });
		await expect(image).toHaveAttribute('src', `/images/${legacyImage}?preview=detail-v1`);
		await expect
			.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);
		await page.goto(`/?search=${encodeURIComponent(legacyTitle)}`);
		await expect(page.getByRole('img', { name: legacyTitle, exact: true })).toHaveAttribute(
			'src',
			`/images/${legacyImage}?preview=card-v1`
		);
	} finally {
		await context.close();
	}
});
