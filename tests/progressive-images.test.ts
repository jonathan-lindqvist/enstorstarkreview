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
import { copyFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import {
	RESPONSIVE_REVIEW_IMAGE_PREVIEWS,
	REVIEW_IMAGE_PRESETS
} from '../src/lib/review-image-previews';

test('serves compact previews with the same image access rules', async ({ page, request }) => {
	const original = await request.get(`/images/${legacyImage}`);
	const preview = await request.get(`/images/${legacyImage}?preview=card-v1`);
	expect(preview.status()).toBe(200);
	expect(preview.headers()['content-type']).toBe('image/webp');
	expect(preview.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
	expect((await preview.body()).length).toBeLessThan((await original.body()).length / 2);
	expect((await sharp(await preview.body()).metadata()).width).toBeLessThanOrEqual(768);
	for (const preset of RESPONSIVE_REVIEW_IMAGE_PREVIEWS) {
		for (const prefix of ['/images', '/api/v1/images']) {
			const response = await request.get(`${prefix}/${legacyImage}?preview=${preset}`);
			expect(response.status()).toBe(200);
			expect(response.headers()['content-type']).toBe('image/webp');
			expect((await sharp(await response.body()).metadata()).width).toBeLessThanOrEqual(
				REVIEW_IMAGE_PRESETS[preset].width
			);
		}
	}
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
		const paths = RESPONSIVE_REVIEW_IMAGE_PREVIEWS.flatMap((preset) =>
			['/images', '/api/v1/images'].map((prefix) => `${prefix}/${image}?preview=${preset}`)
		);
		for (const path of paths) expect((await request.get(path)).status()).toBe(200);
		await bars.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
		for (const path of paths) {
			const deleted = await request.get(path);
			expect(deleted.status()).toBe(404);
			expect(deleted.headers()['cache-control']).toBe('no-store');
		}
		await bars.updateOne(
			{ _id: id },
			{ $unset: { deletedAt: '' }, $set: { publicationStatus: 'unknown' } }
		);
		for (const path of paths) expect((await request.get(path)).status()).toBe(404);
		await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
		const authenticated = await page.evaluate(async (source) => {
			const response = await fetch(source);
			return { status: response.status, cacheControl: response.headers.get('cache-control') };
		}, paths[0]);
		expect(authenticated).toEqual({ status: 200, cacheControl: 'private, no-store' });
	} finally {
		await bars.deleteOne({ _id: id });
		await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
		for (const preset of RESPONSIVE_REVIEW_IMAGE_PREVIEWS) {
			await unlink(join(reviewImageDirectory, 'previews', 'v2', `${image}.${preset}.webp`)).catch(
				() => undefined
			);
		}
	}
});

test('matches photo resolution to density and cover crop without downloading originals', async ({
	browser
}, testInfo) => {
	const template = await bars.findOne({ slug: legacySlug });
	const ids = [new ObjectId(), new ObjectId()];
	const images = ids.map((id) => `${id}.jpg`);
	const prefix = `responsive-${runId}`;
	try {
		for (const [index, image] of images.entries()) {
			await sharp(fixtureImagePath)
				.resize(index ? 3200 : 2400, index ? 2400 : 3200, { fit: 'fill' })
				.jpeg({ quality: 95 })
				.toFile(join(reviewImageDirectory, image));
		}
		await bars.insertMany(
			ids.map((_id, index) => ({
				...template,
				_id,
				slug: `${prefix}-${index}`,
				title: `${prefix} ${index}`,
				image: images[index],
				createdAt: new Date(Date.now() - index * 1000)
			}))
		);
		for (const density of [1, 2, 3]) {
			const context = await browser.newContext({
				viewport: { width: 375, height: 844 },
				deviceScaleFactor: density
			});
			try {
				const page = await context.newPage();
				const originals: string[] = [];
				context.on('request', (request) => {
					const url = new URL(request.url());
					if (images.some((image) => url.pathname === `/images/${image}`) && !url.search)
						originals.push(url.pathname);
				});
				await page.goto(`/?search=${prefix}`);
				for (const index of [0, 1]) {
					const photo = page.getByRole('img', { name: `${prefix} ${index}`, exact: true });
					await photo.scrollIntoViewIfNeeded();
					await expect
						.poll(() =>
							photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)
						)
						.toBe(true);
					await expect
						.poll(() =>
							photo.evaluate((node: HTMLImageElement) => {
								const preset = new URL(node.currentSrc).searchParams.get('preview');
								const width = Number(preset?.match(/^photo-(\d+)-v2$/)?.[1]);
								const box = node.getBoundingClientRect();
								return (
									width >=
									Math.ceil(
										Math.max(box.width, (box.height * node.naturalWidth) / node.naturalHeight) *
											devicePixelRatio
									)
								);
							})
						)
						.toBe(true);
					await expectImagePosition(photo, '50% 50%');
				}
				expect(originals).toEqual([]);
				await page.goto(`/${prefix}-0`);
				const link = page.getByRole('link', {
					name: `Öppna originalbild för ${prefix} 0 i en ny flik`
				});
				await expect(link).toHaveAttribute('href', `/images/${images[0]}`);
				await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
				const photo = page.getByRole('img', { name: `${prefix} 0`, exact: true });
				await expectSquare(photo);
				if (density === 3) {
					for (const width of [375, 1280]) {
						await page.setViewportSize({ width, height: 844 });
						for (const theme of ['light', 'dark']) {
							await page.evaluate(
								(value) => (document.documentElement.dataset.theme = value),
								theme
							);
							await page.screenshot({
								path: testInfo.outputPath(`responsive-${width}-${theme}.png`),
								animations: 'disabled'
							});
						}
					}
				}
				expect(originals).toEqual([]);
				await link.focus();
				const popup = page.waitForEvent('popup');
				await link.press('Enter');
				const original = await popup;
				await original.waitForLoadState();
				expect(new URL(original.url()).pathname).toBe(`/images/${images[0]}`);
				expect(originals).toHaveLength(1);
			} finally {
				await context.close();
			}
		}
	} finally {
		await bars.deleteMany({ _id: { $in: ids } });
		for (const image of images) {
			await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
			for (const preset of RESPONSIVE_REVIEW_IMAGE_PREVIEWS)
				await unlink(join(reviewImageDirectory, 'previews', 'v2', `${image}.${preset}.webp`)).catch(
					() => undefined
				);
		}
	}
});

test('falls back to an original only when responsive derivatives fail', async ({ page }) => {
	await page.route(
		(url) => url.pathname === `/images/${legacyImage}` && url.searchParams.has('preview'),
		(route) => route.fulfill({ status: 503 })
	);
	await page.goto(`/${legacySlug}`);
	const image = page.getByRole('img', { name: legacyTitle, exact: true });
	await expect(image).toHaveAttribute('src', `/images/${legacyImage}`);
	await expect(image).not.toHaveAttribute('srcset');
	await expect
		.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
		.toBe(true);
});

test('selects a landscape cover source in initial HTML with and without JavaScript', async ({
	browser,
	request
}) => {
	const id = new ObjectId();
	const image = `${id}.jpg`;
	const slug = `initial-crop-${runId}`;
	try {
		const template = await bars.findOne({ slug: legacySlug });
		await sharp(fixtureImagePath)
			.resize(3200, 2400, { fit: 'fill' })
			.jpeg()
			.toFile(join(reviewImageDirectory, image));
		await bars.insertOne({
			...template,
			_id: id,
			slug,
			title: slug,
			image,
			imageDimensions: { width: 3200, height: 2400 }
		});
		const api = await request.get(`/api/v1/reviews/${slug}`);
		expect(api.status()).toBe(200);
		expect((await api.json()).image.dimensions).toEqual({ width: 3200, height: 2400 });
		for (const javaScriptEnabled of [false, true]) {
			for (const path of [`/?search=${slug}`, `/${slug}`]) {
				const context = await browser.newContext({
					viewport: { width: 375, height: 844 },
					deviceScaleFactor: 3,
					javaScriptEnabled
				});
				try {
					const page = await context.newPage();
					// Each page starts cold; warm navigation may reuse a larger cached candidate.
					const downloads: string[] = [];
					const record = (request: import('@playwright/test').Request) => {
						if (new URL(request.url()).pathname === `/images/${image}`)
							downloads.push(request.url());
					};
					page.on('request', record);
					await page.goto(path);
					const photo = page.getByRole('img', { name: slug, exact: true });
					await expect(photo).toHaveAttribute('sizes', /\* 1\.3333333333333333/);
					await expect
						.poll(() =>
							photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)
						)
						.toBe(true);
					// Hydration can emit another request for the same URL; selection must stay on one candidate.
					expect(
						new Set(downloads).size,
						JSON.stringify({ path, javaScriptEnabled, downloads })
					).toBe(1);
					expect(downloads.every((url) => new URL(url).searchParams.has('preview'))).toBe(true);
					await expect
						.poll(() =>
							photo.evaluate((node: HTMLImageElement) => {
								const width = Number(
									new URL(node.currentSrc).searchParams
										.get('preview')
										?.match(/^photo-(\d+)-v2$/)?.[1]
								);
								return width >= node.clientWidth * (4 / 3) * devicePixelRatio;
							})
						)
						.toBe(true);
					page.off('request', record);
				} finally {
					await context.close();
				}
			}
		}
	} finally {
		await bars.deleteOne({ _id: id });
		await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
		for (const preset of RESPONSIVE_REVIEW_IMAGE_PREVIEWS)
			await unlink(join(reviewImageDirectory, 'previews', 'v2', `${image}.${preset}.webp`)).catch(
				() => undefined
			);
	}
});

test('renders responsive photos and locally served fonts without JavaScript', async ({
	browser
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		const remoteFonts: string[] = [];
		page.on('request', (request) => {
			if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
		});
		for (const path of [`/?search=${encodeURIComponent(legacyTitle)}`, `/${legacySlug}`]) {
			await page.goto(path);
			const photo = page.getByRole('img', { name: legacyTitle, exact: true });
			await expect(photo).toHaveAttribute('srcset', /photo-2560-v2 2560w/);
			await expect
				.poll(() =>
					photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)
				)
				.toBe(true);
			await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(2);
		}
		expect(remoteFonts).toEqual([]);
	} finally {
		await context.close();
	}
});
