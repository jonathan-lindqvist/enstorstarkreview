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

test('brand table combines regular price and value samples and sorts every column', async ({
	request,
	page
}, testInfo) => {
	const brand = `Husets provöl ${runId}`;
	const lowPriceBrand = `Ångbryggeriets lager ${runId}`;
	const highPriceBrand = `Ölbryggeriets lager ${runId}`;
	const tiedValueBrand = `Zebrans lager ${runId}`;
	const unknownVolumeBrand = `Utan volym ${runId}`;
	const source = await bars.findOne({ slug: legacySlug });
	if (!source) throw new Error('Missing review fixture');
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
		{ beerPriceKr: 60, beerBrand: unknownVolumeBrand },
		...Array.from({ length: 3 }, () => ({
			beerPriceKr: 30,
			beerVolumeCl: 60,
			beerBrand: lowPriceBrand
		})),
		{ beerPriceKr: 90, beerVolumeCl: 45, beerBrand: highPriceBrand },
		{ beerPriceKr: 60, beerVolumeCl: 30, beerBrand: tiedValueBrand }
	];
	const slugs = reviews.map((_, i) => `brand-price-${runId}-${i}`);
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
			'Snitt cl/kr'
		]);
		const row = table.getByRole('row').filter({
			has: page.getByRole('rowheader', { name: brand, exact: true })
		});
		await expect(row.getByRole('cell').nth(0)).toHaveText('60,0 kr');
		await expect(row.getByRole('cell').nth(1)).toContainText('0,67');
		await expect(row.getByRole('cell').nth(1)).toContainText('1 med volym');
		await expect(
			table.getByRole('rowheader', { name: `Happy hour ${runId}`, exact: true })
		).toHaveCount(0);
		await expect(page.getByText('Happy hour-fynd', { exact: true })).toBeVisible();
		const unknownVolume = table.getByRole('row').filter({
			has: page.getByRole('rowheader', { name: unknownVolumeBrand, exact: true })
		});
		await expect(unknownVolume.getByRole('cell').nth(1)).toHaveText('–');
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
		const fixtureBrands = [
			brand,
			lowPriceBrand,
			highPriceBrand,
			tiedValueBrand,
			unknownVolumeBrand
		];
		const expectOrder = async (expected: string[]) => {
			await expect
				.poll(async () =>
					(await table.getByRole('rowheader').allTextContents()).filter((name) =>
						fixtureBrands.includes(name)
					)
				)
				.toEqual(expected);
		};
		const initialOrder = [lowPriceBrand, brand, unknownVolumeBrand, tiedValueBrand, highPriceBrand];
		await expectOrder(initialOrder);
		await expect(table.getByRole('columnheader').nth(1)).toHaveAttribute('aria-sort', 'ascending');
		const sortCases = [
			[
				'Snittpris',
				'descending',
				[highPriceBrand, brand, unknownVolumeBrand, tiedValueBrand, lowPriceBrand]
			],
			['Snittpris', 'ascending', initialOrder],
			[
				'Ölmärke',
				'ascending',
				[brand, unknownVolumeBrand, tiedValueBrand, lowPriceBrand, highPriceBrand]
			],
			[
				'Ölmärke',
				'descending',
				[highPriceBrand, lowPriceBrand, tiedValueBrand, unknownVolumeBrand, brand]
			],
			[
				'Snitt cl/kr',
				'descending',
				[lowPriceBrand, brand, tiedValueBrand, highPriceBrand, unknownVolumeBrand]
			],
			[
				'Snitt cl/kr',
				'ascending',
				[tiedValueBrand, highPriceBrand, brand, lowPriceBrand, unknownVolumeBrand]
			]
		] as const;
		for (const [label, direction, expected] of sortCases) {
			const button = table.getByRole('button', { name: new RegExp(`^Sortera efter ${label},`) });
			await button.click();
			await expectOrder([...expected]);
			await expect(button.locator('..')).toHaveAttribute('aria-sort', direction);
			await expect(table.locator('th[aria-sort]')).toHaveCount(1);
		}
		const nameButton = table.getByRole('button', { name: /^Sortera efter Ölmärke,/ });
		await nameButton.focus();
		await nameButton.press('Enter');
		await expectOrder([brand, unknownVolumeBrand, tiedValueBrand, lowPriceBrand, highPriceBrand]);
		await expect(nameButton).toBeFocused();
		await nameButton.press('Space');
		await expectOrder([highPriceBrand, lowPriceBrand, tiedValueBrand, unknownVolumeBrand, brand]);
		await page.reload();
		await expectOrder(initialOrder);
		await expect(table.getByRole('columnheader').nth(1)).toHaveAttribute('aria-sort', 'ascending');
		await nameButton.click();
		await page.goto('/');
		await page.goto('/statistik');
		await expectOrder(initialOrder);
		await page.setViewportSize({ width: 375, height: 900 });
		await expect(table).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Sortering', exact: true })).toHaveCount(0);
		await expect(page.getByRole('list', { name: 'Ölmärken', exact: true })).toHaveCount(0);
		await expectOrder(initialOrder);
		await expect(row.getByRole('cell').nth(0)).toHaveText('60,0 kr');
		await expect(row.getByRole('cell').nth(1)).toContainText('1 med volym');
		await expect(unknownVolume.getByRole('cell').nth(1)).toHaveText('–');
		for (const [label, direction, expected] of sortCases) {
			const button = table.getByRole('button', { name: new RegExp(`^Sortera efter ${label},`) });
			await button.click();
			await expectOrder([...expected]);
			await expect(button.locator('..')).toHaveAttribute('aria-sort', direction);
		}
		await page.setViewportSize({ width: 640, height: 900 });
		await expect(table.getByRole('columnheader').nth(2)).toHaveAttribute('aria-sort', 'ascending');
		await expectOrder([tiedValueBrand, highPriceBrand, brand, lowPriceBrand, unknownVolumeBrand]);
		await nameButton.click();
		await page.setViewportSize({ width: 375, height: 900 });
		await expect(table.getByRole('columnheader').nth(0)).toHaveAttribute('aria-sort', 'ascending');
		await expectOrder([brand, unknownVolumeBrand, tiedValueBrand, lowPriceBrand, highPriceBrand]);
		await nameButton.focus();
		await nameButton.press('Space');
		await expectOrder([highPriceBrand, lowPriceBrand, tiedValueBrand, unknownVolumeBrand, brand]);
		await expect(nameButton).toBeFocused();
		await page.reload();
		await expectOrder(initialOrder);
		await expect(table.getByRole('columnheader').nth(1)).toHaveAttribute('aria-sort', 'ascending');
		for (const width of [320, 375, 640, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await expect(page.getByRole('heading', { name: 'Snittpris per ölmärke' })).toBeVisible();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
				).toBe(true);
				await expect(table).toBeVisible();
				const tableBounds = await table.boundingBox();
				expect(tableBounds!.x).toBeGreaterThanOrEqual(0);
				expect(tableBounds!.x + tableBounds!.width).toBeLessThanOrEqual(width);
				const panel = page.getByRole('region', { name: 'Snittpris per ölmärke', exact: true });
				expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
					true
				);
				const valueCountLines = await row
					.getByRole('cell')
					.nth(1)
					.locator('span')
					.evaluate((element) => {
						const range = document.createRange();
						range.selectNodeContents(element);
						return range.getClientRects().length;
					});
				expect(valueCountLines).toBe(1);
				expect(
					await row
						.getByRole('cell')
						.nth(1)
						.locator('span')
						.evaluate((element) => element.scrollWidth <= element.clientWidth)
				).toBe(true);
				let previousLabelRight: number | null = null;
				for (const button of await table.getByRole('button').all()) {
					const bounds = await button.boundingBox();
					const label = await button.locator('span').boundingBox();
					expect(bounds).not.toBeNull();
					expect(label).not.toBeNull();
					expect(bounds!.width).toBeGreaterThanOrEqual(44);
					expect(bounds!.height).toBeGreaterThanOrEqual(44);
					expect(label!.x).toBeGreaterThanOrEqual(bounds!.x - 0.5);
					expect(label!.x + label!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5);
					if (previousLabelRight !== null) {
						expect(label!.x - previousLabelRight).toBeGreaterThanOrEqual(8);
					}
					previousLabelRight = label!.x + label!.width;
				}
				const priceLayout = await row
					.getByRole('cell')
					.nth(0)
					.evaluate((cell) => {
						const range = document.createRange();
						range.selectNodeContents(cell);
						return {
							height: range.getBoundingClientRect().height,
							lineHeight: parseFloat(getComputedStyle(cell).lineHeight)
						};
					});
				expect(priceLayout.height).toBeLessThanOrEqual(priceLayout.lineHeight);
				await nameButton.focus();
				await page.getByRole('region', { name: 'Snittpris per ölmärke', exact: true }).screenshot({
					path: testInfo.outputPath(`brand-table-${width}-${theme}.png`),
					animations: 'disabled'
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
