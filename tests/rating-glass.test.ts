import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { bars, legacySlug, runId, test } from './fixtures/reviews';

for (const width of [375, 1280]) {
	for (const theme of ['light', 'dark']) {
		test(`shows all four logo-glass states at ${width}px in ${theme}`, async ({
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
					const rating = card.getByRole('img', {
						name: `Helhetsbetyg ${review.rating} av 3`,
						exact: true
					});
					await expect(rating).toBeVisible();
					await expect(rating).toHaveText(new RegExp(`${review.rating}\\s*/3`));
					await expect(rating.locator('img')).toHaveAttribute(
						'src',
						`/rating-glass/${review.rating}.png`
					);
					await expect
						.poll(async () => (await rating.locator('img').boundingBox())?.width)
						.toBe(32);
				}
				await page.screenshot({ path: testInfo.outputPath('cards.png'), fullPage: true });
				for (const review of reviews) {
					await page.goto(`/${review.slug}`);
					const glass = page.getByRole('img', {
						name: `Helhetsbetyg ${review.rating} av 3`,
						exact: true
					});
					await expect(glass).toHaveAttribute('src', `/rating-glass/${review.rating}.png`);
					await expect
						.poll(() => glass.evaluate((image: HTMLImageElement) => image.naturalWidth))
						.toBeGreaterThan(0);
					await expect.poll(async () => (await glass.boundingBox())?.width).toBe(80);
					await expect(page.getByText(`${review.rating} av 3`, { exact: true })).toBeVisible();
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
