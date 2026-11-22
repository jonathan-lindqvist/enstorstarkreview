import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import type { PublicReviewStatistics } from '../src/lib/types/review-statistics';
import {
	bars,
	isolatedQuota,
	legacySlug,
	loginRateLimits,
	mapGeocodes,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';

const brand = `Områdeslager ${runId}`;
const reviewer = `omradesrecensent-${runId}`;
const fixtures = [
	{ name: 'Göteborg', price: 40, coordinates: [57.7089, 11.9746] },
	{ name: 'Kungsbacka', price: 60, coordinates: [57.4875, 12.0764] },
	{ name: 'Stockholm', price: 80, coordinates: [59.3293, 18.0686] },
	{ name: 'Tallinn', price: 100, coordinates: [59.437, 24.7536] },
	{ name: 'Utan kartposition', price: 120 },
	{ name: 'Utkast', price: 140, coordinates: [57.7089, 11.9746], status: 'draft' },
	{ name: 'Okänd status', price: 160, coordinates: [57.7089, 11.9746], status: 'unknown' },
	{ name: 'Borttagen', price: 180, coordinates: [57.7089, 11.9746], deleted: true }
].map((fixture, index) => ({
	...fixture,
	slug: `stats-${runId}-${index}`,
	address: `Statistikgatan ${runId}-${index}`
}));

test('switches the whole statistics page across cumulative, shareable regions', async ({
	page,
	request,
	browser,
	baseURL
}, testInfo) => {
	const auth = await isolatedQuota(loginRateLimits, async () => {
		const session = await request.post('/api/v1/sessions', {
			data: { username: publisherUsername, password: publisherPassword }
		});
		expect(session.status()).toBe(201);
		return { authorization: `Bearer ${(await session.json()).token}` };
	});
	const source = await bars.findOne({ slug: legacySlug });
	expect(source).toBeTruthy();
	const statsPath = '/api/v1/statistics';
	const getStatistics = async (query = ''): Promise<PublicReviewStatistics> => {
		const response = await request.get(`${statsPath}${query}`);
		expect(response.status()).toBe(200);
		return response.json();
	};
	const baseline = await getStatistics();
	try {
		await bars.insertMany(
			fixtures.map((fixture, index) => ({
				...source,
				_id: new ObjectId(),
				slug: fixture.slug,
				title: fixture.name,
				location: fixture.address,
				author: reviewer,
				coAuthors: [],
				beerBrand: brand,
				beerPriceKr: fixture.price,
				beerVolumeCl: 40,
				publicationStatus: index === 0 ? 'draft' : (fixture.status ?? 'published'),
				...(fixture.deleted ? { deletedAt: new Date() } : {})
			}))
		);
		await mapGeocodes.insertMany(
			fixtures.flatMap((fixture) =>
				fixture.coordinates
					? [
							{
								addressKey: fixture.address.toLowerCase(),
								address: fixture.address,
								status: 'resolved',
								latitude: fixture.coordinates[0],
								longitude: fixture.coordinates[1],
								updatedAt: new Date()
							}
						]
					: []
			)
		);
		const draftStats = await getStatistics('?region=goteborg');
		expect(draftStats.priceComparison.map(({ slug }) => slug)).not.toContain(fixtures[0].slug);
		expect(
			(
				await request.post(`/api/v1/reviews/${fixtures[0].slug}/publication`, { headers: auth })
			).status()
		).toBe(200);

		const fixtureSlugs = new Set(fixtures.map(({ slug }) => slug));
		for (const [region, count, average, totalSpentKr] of [
			['goteborg', 2, 50, 100],
			['sverige', 3, 60, 180],
			['varlden', 5, 80, 400]
		] as const) {
			const statistics = await getStatistics(`?region=${region}`);
			expect(statistics.beerBrandPrices).toContainEqual({
				brand,
				averagePriceKr: average,
				reviewCount: count,
				happyHourReviewCount: 0
			});
			expect(
				statistics.priceComparison.map(({ slug }) => slug).filter((slug) => fixtureSlugs.has(slug))
			).toEqual(fixtures.slice(0, count).map(({ slug }) => slug));
			expect(statistics.reviewerSpending).toContainEqual({ username: reviewer, totalSpentKr });
			expect(statistics.reviewerSpending.reduce((sum, row) => sum + row.totalSpentKr, 0)).toBe(
				statistics.totalReviewerSpendKr
			);
			if (region === 'varlden') {
				expect(statistics.totalReviews).toBe(baseline.totalReviews + count);
				expect(statistics.totalReviewerSpendKr).toBe(baseline.totalReviewerSpendKr + totalSpentKr);
				expect(await getStatistics()).toEqual(statistics);
			}
		}

		await page
			.context()
			.addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
		await page.goto('/statistik');
		const switcher = page.getByRole('navigation', { name: 'Statistikområde' });
		const link = (label: string) => switcher.getByRole('link', { name: label, exact: true });
		const brandRow = page.getByRole('row', { name: new RegExp(brand) });
		const spending = page.getByText(reviewer, { exact: true }).locator('..');
		const disclosure = page.getByText('Per recensent', { exact: true });
		await expect(link('Göteborg')).toHaveAttribute('aria-current', 'page');
		await expect(brandRow).toContainText('50,0');
		await disclosure.click();
		await expect(spending).toContainText('100 kr');
		await link('Sverige').focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\?region=sverige$/);
		await expect(link('Sverige')).toHaveAttribute('aria-current', 'page');
		await expect(link('Sverige')).toBeFocused();
		await expect(brandRow).toContainText('60,0');
		await expect(spending).toContainText('180 kr');
		await page.goBack();
		await expect(link('Göteborg')).toHaveAttribute('aria-current', 'page');
		await page.goForward();
		await expect(link('Sverige')).toHaveAttribute('aria-current', 'page');
		await page.reload();
		await expect(link('Sverige')).toHaveAttribute('aria-current', 'page');
		await expect(brandRow).toContainText('60,0');
		await disclosure.click();
		await link('Världen').click();
		await expect(spending).toContainText('400 kr');

		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ['light', 'dark']) {
				await page.context().addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
				await page.goto('/statistik');
				await expect(link('Göteborg')).toHaveAttribute('aria-current', 'page');
				const links = await switcher.getByRole('link').all();
				const bounds = await Promise.all(links.map((segment) => segment.boundingBox()));
				for (const bound of bounds) {
					expect(bound?.y).toBe(bounds[0]?.y);
					expect(bound?.width).toBeGreaterThanOrEqual(44);
					expect(bound?.height).toBeGreaterThanOrEqual(44);
				}
				await page.screenshot({
					path: testInfo.outputPath(`statistics-regions-${width}-${theme}.png`),
					animations: 'disabled'
				});
			}
		}

		const staticContext = await browser.newContext({ javaScriptEnabled: false });
		try {
			await staticContext.addCookies([
				{ name: 'analytics_consent', value: 'denied', url: baseURL! }
			]);
			const staticPage = await staticContext.newPage();
			await staticPage.goto('/statistik?region=varlden');
			const staticSwitch = staticPage.getByRole('navigation', { name: 'Statistikområde' });
			await expect(staticSwitch.getByRole('link', { name: 'Världen' })).toHaveAttribute(
				'aria-current',
				'page'
			);
			await staticSwitch.getByRole('link', { name: 'Göteborg' }).click();
			await expect(staticPage).toHaveURL(/\/statistik$/);
		} finally {
			await staticContext.close();
		}
	} finally {
		await bars.deleteMany({ slug: { $in: fixtures.slice(1).map(({ slug }) => slug) } });
		await mapGeocodes.deleteMany({
			addressKey: { $in: fixtures.map(({ address }) => address.toLowerCase()) }
		});
		const firstPath = `/api/v1/reviews/${fixtures[0].slug}`;
		const first = await request.get(firstPath, { headers: auth });
		const etag = first.headers().etag;
		if (etag) await request.delete(firstPath, { headers: { ...auth, 'if-match': etag } });
		await bars.deleteOne({ slug: fixtures[0].slug });
	}
});
