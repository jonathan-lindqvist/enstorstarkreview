import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
	bars,
	isolatedQuota,
	legacySlug,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';
import { expectSquare, login } from './fixtures/browser';

test.beforeEach(async ({ page, baseURL }) => {
	await page.context().addCookies([
		{ name: 'analytics_consent', value: 'denied', url: baseURL! },
		{ name: 'location_enabled', value: 'false', url: baseURL! }
	]);
});

for (const width of [375, 1280]) {
	for (const theme of ['light', 'dark']) {
		test(`shows only awarded logo-glass states at ${width}px in ${theme}`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize({ width, height: 900 });
			const baseURL = testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173';
			await page.context().addCookies([
				{ name: 'theme', value: theme, url: baseURL },
				{ name: 'analytics_consent', value: 'denied', url: baseURL }
			]);
			const source = await bars.findOne({ slug: legacySlug });
			if (!source) throw new Error('The shared review fixture is missing.');
			const prefix = `rating-glass-${width}-${theme}-${runId}`;
			const reviews = [0, 1, 2, 3].map((rating) => ({
				...source,
				_id: new ObjectId(),
				title: `Glasbetyg ${prefix} ${rating}`,
				slug: `${prefix}-${rating}`,
				rating
			}));
			try {
				await bars.insertMany(reviews);
				await page.goto(`/?search=${encodeURIComponent(prefix)}`);
				for (const review of reviews) {
					const card = page.locator(`a[href="/${review.slug}"]`);
					await expect(card.locator('img[src="/rating-glass/0.png"]')).toHaveCount(0);
					if (review.rating > 0) {
						await expect(
							card.getByRole('img', { name: `Helhetsbetyg ${review.rating} av 3`, exact: true })
						).toBeVisible();
					} else {
						await expect(card.getByText('Helhetsbetyg 0 av 3', { exact: true })).toBeAttached();
					}
					expect(await card.innerText()).not.toMatch(/\d\s*\/3/);
				}
				await page.screenshot({ path: testInfo.outputPath('cards.png'), fullPage: true });
				for (const review of reviews) {
					await page.goto(`/${review.slug}`);
					const glass = page.getByRole('img', {
						name: `Helhetsbetyg ${review.rating} av 3`,
						exact: true
					});
					await expect(page.locator('img[src="/rating-glass/0.png"]')).toHaveCount(0);
					if (review.rating > 0) {
						await expect(glass).toHaveAttribute('src', `/rating-glass/${review.rating}.png`);
						await expect
							.poll(() => glass.evaluate((image: HTMLImageElement) => image.naturalWidth))
							.toBeGreaterThan(0);
					}
					await expect(page.getByText(`${review.rating} av 3`, { exact: true })).toHaveCount(0);
					await expect
						.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
						.toBe(true);
					await page.screenshot({ path: testInfo.outputPath(`detail-${review.rating}.png`) });
				}
			} finally {
				await bars.deleteMany({ _id: { $in: reviews.map((review) => review._id) } });
			}
		});
	}
}

test('hides numeric overall scores on awarded cards and details', async ({ page }) => {
	await page.goto(`/?search=${legacySlug.replace('playwright-legacy-', '')}`);
	const card = page.locator(`a[href="/${legacySlug}"]`);
	await expect(card).toBeVisible();
	expect(await card.innerText()).not.toMatch(/\d\s*\/3/);
	await page.goto(`/${legacySlug}`);
	await expect(page.getByText('2 av 3', { exact: true })).toHaveCount(0);
});

test('moves every card detail onto its square photo without overflow', async ({
	page
}, testInfo) => {
	const source = await bars.findOne({ slug: legacySlug });
	const id = new ObjectId();
	const slug = `square-photo-${runId}`;
	try {
		await bars.insertOne({
			...source,
			_id: id,
			slug,
			title: `Göteborgsbaren med ett riktigt långt namn och många aktiviteter ${slug}`,
			beerBrand: 'En ovanligt lång och lokal öl från Göteborg',
			isHappyHourPrice: true,
			attributes: [
				'quiz',
				'liveMusic',
				'boardGames',
				'shuffleboard',
				'darts',
				'billiards',
				'karaoke',
				'sportsTv'
			]
		});
		for (const width of [320, 375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(`/?search=${slug}`);
			const card = page.locator(`a[href="/${slug}"]`);
			await expect(card).toBeVisible();
			await expectSquare(card);
			await expect(card.getByText('+6', { exact: true })).toBeVisible();
			await expect(
				card.getByRole('list', { name: 'Aktiviteter och utbud' }).locator('li')
			).toHaveCount(3);
			const photo = (await card.getByRole('img', { name: /Göteborgsbaren/ }).boundingBox())!;
			for (const detail of [
				card.getByRole('heading').first(),
				card.getByText('65 kr*', { exact: true }),
				card.getByText('* happy hour', { exact: true }),
				card.getByTestId('review-description-preview')
			]) {
				const bounds = (await detail.boundingBox())!;
				expect(bounds.y).toBeGreaterThanOrEqual(photo.y);
				expect(bounds.y + bounds.height).toBeLessThanOrEqual(photo.y + photo.height + 1);
			}
			expect(
				await card.evaluate(
					(element) =>
						element.scrollWidth <= element.clientWidth &&
						element.scrollHeight <= element.clientHeight
				)
			).toBe(true);
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await card.screenshot({ path: testInfo.outputPath(`square-${width}-${theme}.png`) });
			}
		}
		await bars.updateOne(
			{ _id: id },
			{ $unset: { image: '' }, $set: { title: `${'Göteborgsbaren'.repeat(16)} ${slug}` } }
		);
		await page.setViewportSize({ width: 375, height: 900 });
		// Use a new listing query so its saved navigation snapshot cannot restore the old photo.
		await page.goto(`/?search=${slug}&sort=oldest`);
		await page.addStyleTag({ content: 'html { font-size: 20px; }' });
		const card = page.locator(`a[href="/${slug}"]`);
		await expect(card.getByRole('heading').first()).toHaveText(
			`${'Göteborgsbaren'.repeat(16)} ${slug}`
		);
		await expectSquare(card);
		await card.focus();
		await expect(card).toBeFocused();
		await expect(card).toHaveCSS('outline-style', 'solid');
		const bounds = (await card.boundingBox())!;
		const heading = (await card.getByRole('heading').first().boundingBox())!;
		expect(heading.y).toBeGreaterThanOrEqual(bounds.y);
		expect(heading.x + heading.width).toBeLessThanOrEqual(bounds.x + bounds.width);
		await expect(card.getByRole('img', { name: /Göteborgsbaren/ })).not.toHaveAttribute(
			'src',
			/\/images\//
		);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await card.screenshot({ path: testInfo.outputPath(`fallback-enlarged-${theme}.png`) });
		}
	} finally {
		await bars.deleteOne({ _id: id });
	}
});

test('uses the three awarded mugs in the FAQ and an average stamp count in statistics', async ({
	page,
	request
}) => {
	await page.goto('/about');
	const legend = page.getByRole('heading', { name: 'Hur fungerar stämplarna?' }).locator('..');
	await expect(legend.locator('img[src^="/rating-glass/"]')).toHaveCount(3);
	await expect(legend.locator('img[src="/rating-glass/0.png"]')).toHaveCount(0);
	expect(await legend.innerText()).not.toMatch(/\d\s*\/3/);
	const statistics = await (await request.get('/api/v1/statistics')).json();
	await page.goto('/statistik');
	const stamps = page.getByText('Stämplar', { exact: true }).locator('../..');
	await expect(stamps).toContainText('i snitt per bar');
	const average =
		statistics.averageRating === null
			? '–'
			: statistics.averageRating.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
	await expect(stamps.locator('dd')).toHaveText(average);
});

test('keeps the native overall slider and history accessible without numeric score displays', async ({
	page
}) => {
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${legacySlug}/edit`);
	const slider = page.getByRole('slider', { name: 'Helhetsbetyg', exact: true });
	const section = slider.locator('../..');
	await slider.focus();
	await slider.press('Home');
	await expect(slider).toHaveValue('0');
	await expect(section.getByText('Ingen stämpel', { exact: true })).toBeVisible();
	await expect(section.locator('img[src="/rating-glass/0.png"]')).toHaveCount(0);
	await slider.press('ArrowRight');
	await expect(slider).toHaveValue('1');
	await expect(section.getByRole('img', { name: 'Helhetsbetyg 1 av 3' })).toBeVisible();
	expect(await section.innerText()).not.toMatch(/\d\s*\/3/);
	const id = new ObjectId();
	const source = await bars.findOne({ slug: legacySlug });
	const slug = `stamp-history-${runId}`;
	try {
		await bars.insertOne({
			...source,
			_id: id,
			slug,
			changeLog: [
				{
					updatedAt: new Date(),
					updatedBy: publisherUsername,
					changes: [{ field: 'rating', label: 'Helhetsbetyg', before: '0', after: '3' }]
				}
			]
		});
		await page.goto(`/${slug}/history`);
		const change = page.getByText('Helhetsbetyg', { exact: true }).locator('..');
		await expect(change.getByRole('img', { name: 'Helhetsbetyg 3 av 3' })).toBeVisible();
		await expect(change.locator('img[src="/rating-glass/0.png"]')).toHaveCount(0);
		expect(await change.innerText()).not.toMatch(/^\s*[03]\s*$/m);
	} finally {
		await bars.deleteOne({ _id: id });
	}
});
