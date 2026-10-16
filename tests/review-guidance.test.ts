import { expect } from '@playwright/test';
import {
	bars,
	test,
	legacySlug,
	legacyAddress,
	publisherUsername,
	publisherPassword,
	loginRateLimits,
	isolatedQuota,
	fixtureImagePath,
	runId
} from './fixtures/reviews';
import {
	login,
	installGeolocationMock,
	emitGeolocationPosition,
	emitGeolocationError,
	readGeolocationWatchCount,
	readGeolocationState,
	nextWizardStep
} from './fixtures/browser';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const validator = new Ajv2020({ strict: false });
validator.addSchema(parse(readFileSync('openapi/v1.yaml', 'utf8')), 'contract');
const validateStatistics = validator.getSchema('contract#/components/schemas/ReviewStatistics')!;

test('normal form uses saved address, excludes itself, and clears an explicitly requested location', async ({
	page
}) => {
	await installGeolocationMock(page);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${legacySlug}/edit`);
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await expect(guidance).toContainText('adressens sparade position');
	await expect(guidance.locator('dd').first()).toHaveText('2');
	await expect(guidance.locator(`a[href$="/${legacySlug}"]`)).toHaveCount(0);
	expect(await readGeolocationWatchCount(page)).toBe(0);
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await guidance.screenshot({ path: `/tmp/qol-nearby-${width}-${theme}.png` });
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
		}
	}
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.getByLabel('Adress', { exact: true }).fill(`Okänd gata ${runId}`);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await emitGeolocationPosition(page, 57.72, 12.03, 10);
	await expect(guidance).toContainText('din position');
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toContain(73);
	await page.getByLabel('Adress', { exact: true }).fill('En annan okänd gata');
	await expect(guidance.locator('dd')).toHaveCount(0);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await emitGeolocationError(page, 1);
	await expect(guidance).toContainText('Platsåtkomst nekades');
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds.length).toBe(2);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await page.getByRole('link', { name: 'Hem', exact: true }).click();
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds.length).toBe(3);
});

test('wizard shows the same helper beside barhop rating without changing its score', async ({
	page
}) => {
	await installGeolocationMock(page);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto('/admin/reviews/create/wizard');
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill('Test av närhet');
	await page.getByLabel('Adress', { exact: true }).fill(legacyAddress);
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByRole('radio', { name: 'Falcon Export', exact: true }).check();
	await nextWizardStep(page);
	for (let aspect = 0; aspect < 7; aspect += 1) await nextWizardStep(page);
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await expect(guidance).toBeVisible();
	await expect(guidance.locator('dd').first()).toHaveText('3');
	await expect(page.locator('#barhopPotential input[value="0"]')).toBeChecked();
	expect(await readGeolocationWatchCount(page)).toBe(0);
});

test('brand table combines regular price and value samples without happy hour columns', async ({
	request,
	page
}) => {
	const brand = `Husets provöl ${runId}`;
	const source = await bars.findOne({ slug: legacySlug });
	if (!source) throw new Error('Missing review fixture');
	const slugs = Array.from({ length: 12 }, (_, i) => `brand-price-${runId}-${i}`);
	const { ObjectId } = await import('mongodb');
	const reviews = [
		{ beerPriceKr: 60, beerVolumeCl: 40, beerBrand: brand, publicationStatus: 'draft' },
		{ beerPriceKr: 80, beerBrand: ` ${brand} `, isHappyHourPrice: true },
		{ beerPriceKr: 1, beerBrand: brand, publicationStatus: 'draft' },
		{ beerPriceKr: 1, beerBrand: brand, publicationStatus: 'unknown' },
		{ beerPriceKr: 1, beerBrand: brand, deletedAt: new Date() },
		{ beerPriceKr: 1000, beerBrand: brand },
		{ beerPriceKr: '50', beerBrand: brand },
		{ beerPriceKr: 50.5, beerBrand: brand },
		{ beerPriceKr: 50, beerBrand: ' ' },
		{ beerPriceKr: 60, beerBrand: brand },
		{ beerPriceKr: 1, beerVolumeCl: 200, beerBrand: `Happy hour ${runId}`, isHappyHourPrice: true },
		{ beerPriceKr: 60, beerBrand: `Utan volym ${runId}` }
	];
	let signedIn = false;
	try {
		await bars.insertMany(
			reviews.map((review, i) => ({ ...source, _id: new ObjectId(), slug: slugs[i], ...review }))
		);
		await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
		signedIn = true;
		await page.goto(`/${slugs[0]}`);
		await page.getByRole('button', { name: 'Publicera recension', exact: true }).click();
		await expect(
			page.getByRole('button', { name: 'Publicera recension', exact: true })
		).toHaveCount(0);
		await page.goto('/statistik');
		const table = page.getByRole('table');
		await expect(table).toHaveCount(1);
		await expect(table.getByRole('columnheader')).toHaveText([
			'Ölmärke',
			'Snittpris',
			'Antal',
			'Snitt cl/kr'
		]);
		const row = table.getByRole('row').filter({
			has: page.getByRole('rowheader', { name: brand, exact: true })
		});
		await expect(row.getByRole('cell').nth(0)).toHaveText('60,0 kr');
		await expect(row.getByRole('cell').nth(1)).toHaveText('2');
		await expect(row.getByRole('cell').nth(2)).toContainText('0,67');
		await expect(row.getByRole('cell').nth(2)).toContainText('1 med volym');
		await expect(
			table.getByRole('rowheader', { name: `Happy hour ${runId}`, exact: true })
		).toHaveCount(0);
		await expect(page.getByText('Happy hour-fynd', { exact: true })).toBeVisible();
		const unknownVolume = table.getByRole('row').filter({
			has: page.getByRole('rowheader', { name: `Utan volym ${runId}`, exact: true })
		});
		await expect(unknownVolume.getByRole('cell').nth(2)).toHaveText('–');
		const response = await request.get('/api/v1/statistics');
		expect(response.status()).toBe(200);
		const statistics = await response.json();
		expect(validateStatistics(statistics)).toBe(true);
		expect(
			statistics.beerBrandPrices.find((entry: { brand: string }) => entry.brand === brand)
		).toEqual({ brand, averagePriceKr: 60, reviewCount: 2, happyHourReviewCount: 0 });
		expect(statistics.beerBrandPrices.some((entry: { brand: string }) => !entry.brand.trim())).toBe(
			false
		);
		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await expect(page.getByRole('heading', { name: 'Snittpris per ölmärke' })).toBeVisible();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
				).toBe(true);
				await page.screenshot({
					path: `/tmp/qol-statistics-${width}-${theme}.png`,
					fullPage: true
				});
			}
		}
	} finally {
		try {
			if (signedIn) {
				await page.goto(`/${slugs[0]}/edit`);
				await page.locator('summary', { hasText: 'Ta bort recensionen' }).click();
				await page.getByRole('button', { name: 'Ja, ta bort', exact: true }).click();
				await page.waitForURL('**/admin/reviews?borttagen=1');
			}
		} finally {
			await bars.deleteMany({ slug: { $in: slugs } });
		}
	}
});
