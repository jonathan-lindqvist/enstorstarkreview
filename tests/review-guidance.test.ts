import { expect, type Page } from '@playwright/test';
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

const showAllBrands = async (page: Page) => {
	const toggle = page.getByRole('button', { name: /^Visa alla \d+ ölmärken$/ });
	if ((await toggle.count()) === 0) return;
	await expect(
		page
			.getByRole('region', { name: 'Snittpris per ölmärke', exact: true })
			.getByRole('table')
			.locator('tbody tr')
	).toHaveCount(5);
	// A click before hydration does nothing.
	await expect(async () => {
		await toggle.click({ timeout: 1000 });
		await expect(page.getByRole('button', { name: 'Visa färre' })).toBeVisible({ timeout: 500 });
	}).toPass();
};

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
		await page.goto('/statistik?region=varlden');
		const table = page
			.getByRole('region', { name: 'Snittpris per ölmärke', exact: true })
			.getByRole('table');
		await expect(table).toHaveCount(1);
		await showAllBrands(page);
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
		await expect(row.getByRole('cell').nth(1)).toContainText(/\(1\)\s*med volym/);
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
		// The price chart points are public only: no draft, unknown status or deleted review.
		const pointSlugs = statistics.priceComparison.map((point: { slug: string }) => point.slug);
		expect(pointSlugs).toContain(slugs[1]);
		for (const hidden of [slugs[2], slugs[3], slugs[4]]) expect(pointSlugs).not.toContain(hidden);
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
		await showAllBrands(page);
		await expectOrder(initialOrder);
		await expect(table.getByRole('columnheader').nth(1)).toHaveAttribute('aria-sort', 'ascending');
		await nameButton.click();
		await page.goto('/');
		await page.goto('/statistik?region=varlden');
		await showAllBrands(page);
		await expectOrder(initialOrder);
		await page.setViewportSize({ width: 375, height: 900 });
		await expect(table).toBeVisible();
		await expect(page.getByRole('combobox', { name: 'Sortering', exact: true })).toHaveCount(0);
		await expect(page.getByRole('list', { name: 'Ölmärken', exact: true })).toHaveCount(0);
		await expectOrder(initialOrder);
		await expect(row.getByRole('cell').nth(0)).toHaveText('60,0 kr');
		await expect(row.getByRole('cell').nth(1)).toContainText(/\(1\)\s*med volym/);
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
		await showAllBrands(page);
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
				expect(
					await row
						.getByRole('cell')
						.nth(1)
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

test('statistics price chart selects published bars and links to the selected review', async ({
	page,
	browser,
	baseURL
}) => {
	const source = await bars.findOne({ slug: legacySlug });
	if (!source) throw new Error('Missing review fixture');
	const { ObjectId } = await import('mongodb');
	const reviews = [
		{ title: `Prisgraf publicerad ${runId}`, beerPriceKr: 61, price: 4 },
		{ title: `Prisgraf utkast ${runId}`, beerPriceKr: 62, price: 2, publicationStatus: 'draft' },
		{ title: `Prisgraf publiceras ${runId}`, beerPriceKr: 63, price: 3, publicationStatus: 'draft' }
	];
	const slugs = reviews.map((_, i) => `price-chart-${runId}-${i}`);
	let signedIn = false;
	try {
		await bars.insertMany(
			reviews.map((review, i) => ({
				...source,
				_id: new ObjectId(),
				slug: slugs[i],
				beerVolumeCl: 40,
				...review
			}))
		);
		await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
		signedIn = true;
		// Publishing invalidates the cached statistics so the directly inserted reviews appear.
		await page.goto(`/${slugs[2]}`);
		await page.getByRole('button', { name: 'Publicera recension', exact: true }).click();
		await expect(
			page.getByRole('button', { name: 'Publicera recension', exact: true })
		).toHaveCount(0);

		const chartUrl = '/statistik?region=varlden';
		await page
			.context()
			.addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
		await page.goto(chartUrl);
		const chart = page.getByRole('region', { name: 'Prisvärdhet mot statistiken', exact: true });
		const reviewLink = chart.getByRole('link', { name: 'Gå till review', exact: true });
		const details = chart.locator('[aria-live]');
		const pointLabel = `${reviews[0].title}: 61 kr för 40 cl, 0,66 cl/kr, betyg 4, väntat betyg 4`;
		const published = chart.getByRole('button', { name: pointLabel, exact: true });
		const newlyPublished = chart.getByRole('button', { name: reviews[2].title });
		await expect(published).toHaveAttribute('aria-pressed', 'false');
		await expect(chart.getByRole('button', { name: reviews[1].title })).toHaveCount(0);
		await expect(chart.locator('svg a')).toHaveCount(0);
		await published.hover();
		await expect(details).toHaveText(pointLabel);
		await expect(reviewLink).toHaveCount(0);
		await chart.getByRole('heading').hover();
		await expect(details).not.toContainText(reviews[0].title);
		await newlyPublished.focus();
		await expect(details).toContainText(reviews[2].title);
		await expect(reviewLink).toHaveCount(0);

		await published.click();
		await expect(page).toHaveURL(chartUrl);
		await expect(published).toHaveAttribute('aria-pressed', 'true');
		await expect(reviewLink).toHaveAttribute('href', `/${slugs[0]}`);
		await newlyPublished.hover();
		await newlyPublished.focus();
		await expect(details).toHaveText(pointLabel);
		await expect(reviewLink).toHaveAttribute('href', `/${slugs[0]}`);

		await newlyPublished.press('Space');
		await expect(published).toHaveAttribute('aria-pressed', 'false');
		await expect(newlyPublished).toHaveAttribute('aria-pressed', 'true');
		await expect(details).toContainText(reviews[2].title);
		await expect(reviewLink).toHaveAttribute('href', `/${slugs[2]}`);
		await page.keyboard.press('Tab');
		await expect(reviewLink).toBeFocused();

		const lowTick = chart.locator('svg').getByText('0,6', { exact: true });
		const highTick = chart.locator('svg').getByText('0,8', { exact: true });
		const x = Number(await published.locator('circle').first().getAttribute('cx'));
		const lowX = Number(await lowTick.getAttribute('x'));
		const highX = Number(await highTick.getAttribute('x'));
		expect((x - lowX) / (highX - lowX)).toBeCloseTo((40 / 61 - 0.6) / 0.2);
		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}

		const regionSwitch = page.getByRole('navigation', { name: 'Statistikområde' });
		await regionSwitch.getByRole('link', { name: 'Sverige', exact: true }).click();
		await expect(page).toHaveURL(/\?region=sverige$/);
		await expect(reviewLink).toHaveCount(0);
		await regionSwitch.getByRole('link', { name: 'Världen', exact: true }).click();
		await expect(published).toHaveAttribute('aria-pressed', 'false');
		await expect(reviewLink).toHaveCount(0);

		const touch = await browser.newContext({
			hasTouch: true,
			viewport: { width: 375, height: 900 }
		});
		try {
			await touch.addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
			const touchPage = await touch.newPage();
			await touchPage.goto(chartUrl);
			const touchChart = touchPage.getByRole('region', {
				name: 'Prisvärdhet mot statistiken',
				exact: true
			});
			await expect(touchChart.locator('[aria-live]')).toHaveText(
				'Tryck på en punkt för att se baren.'
			);
			await expect(touchChart.getByRole('toolbar')).toHaveAccessibleDescription('');
			const touchDot = touchChart.getByRole('button', { name: pointLabel, exact: true });
			await touchDot.tap();
			await expect(touchDot).toHaveAttribute('aria-pressed', 'true');
			await expect(touchChart.getByRole('link', { name: 'Gå till review' })).toHaveAttribute(
				'href',
				`/${slugs[0]}`
			);
		} finally {
			await touch.close();
		}

		// Before the chart measures its container it must not widen a phone viewport.
		const noScript = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 320, height: 900 }
		});
		try {
			const staticPage = await noScript.newPage();
			await staticPage.goto(chartUrl);
			await expect(
				staticPage.getByRole('region', { name: 'Prisvärdhet mot statistiken', exact: true })
			).toBeVisible();
			expect(
				await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
			).toBe(true);
		} finally {
			await noScript.close();
		}
		const precedingDot = published.locator('xpath=preceding-sibling::*[@role="button"][1]');
		await precedingDot.focus();
		await page.keyboard.press('ArrowRight');
		await expect(published).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(published).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('Tab');
		await expect(reviewLink).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(new RegExp(`/${slugs[0]}$`));
	} finally {
		try {
			if (signedIn) {
				await page.goto(`/${slugs[2]}/edit`);
				await page.locator('summary', { hasText: 'Ta bort recensionen' }).click();
				await page.getByRole('button', { name: 'Ja, ta bort', exact: true }).click();
				await page.waitForURL('**/admin/reviews?borttagen=1');
			}
		} finally {
			await bars.deleteMany({ slug: { $in: slugs } });
		}
	}
});

test.describe('price chart overlap on touchscreens', () => {
	test.use({ hasTouch: true, viewport: { width: 375, height: 900 } });

	test('one tap reveals review links for all four matching bars', async ({
		page,
		request,
		baseURL
	}) => {
		const source = await bars.findOne({ slug: legacySlug });
		if (!source) throw new Error('Missing review fixture');
		const { ObjectId } = await import('mongodb');
		const slugs = [1, 2, 3, 4].map((index) => `price-overlap-${runId}-${index}`);
		const [draftSlug, ...publishedSlugs] = slugs;
		const draftPath = `/api/v1/reviews/${draftSlug}`;
		const serving = { beerPriceKr: 60, beerVolumeCl: 48 };
		const rating = 4;
		const auth = await isolatedQuota(loginRateLimits, async () => {
			const session = await request.post('/api/v1/sessions', {
				data: { username: publisherUsername, password: publisherPassword }
			});
			expect(session.status()).toBe(201);
			return { authorization: `Bearer ${(await session.json()).token}` };
		});

		let publishedTag: string | undefined;
		let visibleReviewPaths: (string | null)[];
		try {
			await bars.insertMany(
				slugs.map((slug, index) => ({
					...source,
					_id: new ObjectId(),
					slug,
					title: `Prisgraf överlapp ${index + 1} ${runId}`,
					...serving,
					price: rating,
					publicationStatus: slug === draftSlug ? 'draft' : 'published'
				}))
			);
			// Publish through the API so the chart sees the new fixtures even with a warm cache.
			const publication = await request.post(`${draftPath}/publication`, { headers: auth });
			publishedTag = publication.headers()['etag'];
			expect(publication.status()).toBe(200);
			expect(publishedTag).toBeTruthy();
			const statistics = await request.get('/api/v1/statistics?region=varlden');
			expect(statistics.status()).toBe(200);
			expect((await statistics.json()).priceComparison).toEqual(
				expect.arrayContaining(
					slugs.map((slug) => expect.objectContaining({ slug, ...serving, valueRating: rating }))
				)
			);

			await page
				.context()
				.addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
			await page.goto('/statistik?region=varlden');
			const chart = page.getByRole('region', { name: 'Prisvärdhet mot statistiken', exact: true });
			const plot = chart.locator('svg');
			await expect.poll(async () => Number(await plot.getAttribute('width'))).toBeLessThan(375);
			const x = Number(await plot.getByText('0,8', { exact: true }).getAttribute('x'));
			// The rating label's baseline sits 3.5 px below the center of its row.
			const y = Number(await plot.getByText('4', { exact: true }).getAttribute('y')) - 3.5;
			await plot.tap({ position: { x, y } });

			const paths = slugs.map((slug) => `a[href="/${slug}"]`).join(', ');
			const reviewLinks = chart
				.getByRole('link')
				.and(chart.locator(paths))
				.filter({ visible: true });
			await expect(reviewLinks.first()).toBeVisible();
			visibleReviewPaths = await reviewLinks.evaluateAll((links) =>
				links.map((link) => link.getAttribute('href'))
			);
		} finally {
			try {
				await bars.deleteMany({ slug: { $in: publishedSlugs } });
				if (publishedTag) {
					const deleted = await request.delete(draftPath, {
						headers: { ...auth, 'if-match': publishedTag }
					});
					expect(deleted.status()).toBe(204);
				}
			} finally {
				await bars.deleteMany({ slug: { $in: slugs } });
			}
		}

		test.fail(true, 'A tap on the overlap currently reveals only the topmost review link.');
		expect(visibleReviewPaths.sort()).toEqual(slugs.map((slug) => `/${slug}`).sort());
	});
});

test('wizard highlights the price value gate without changing the rating', async ({ page }) => {
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto('/admin/reviews/create/wizard');
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill('Test av prisgate');
	await page.getByLabel('Adress', { exact: true }).fill(legacyAddress);
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('55');
	await page.getByRole('radio', { name: 'Falcon Export', exact: true }).check();
	await nextWizardStep(page);
	for (let aspect = 0; aspect < 4; aspect += 1) await nextWizardStep(page);
	await expect(page.getByTestId('price-value-hint')).toContainText(
		'4 vid 0,73 cl/kr (antar 40 cl)'
	);
	await expect(page.locator('#price [data-suggested]')).toHaveText(/^4/);
	await expect(page.locator('#price input[value="0"]')).toBeChecked();
	await page.locator('#price input[value="1"]').check();
	await expect(page.locator('#price input[value="1"]')).toBeChecked();
	await expect(page.locator('#price [data-suggested]')).toHaveText(/^4/);
});

test('statistics shows price value gates and the assumed volume', async ({ page }) => {
	await page.goto('/statistik?region=varlden');
	const section = page.getByRole('region', { name: 'Prisvärdhet mot statistiken', exact: true });
	await expect(section).toContainText('Saknar en bar volym antas 40 cl');
	await expect(section.locator('svg').getByText('cl/kr', { exact: true })).toBeVisible();
	const table = section.getByRole('table', { name: 'Intervall för prisvärdhet' });
	await expect(table.getByRole('columnheader', { name: 'cl/kr' })).toBeVisible();
	await expect(table.locator('tbody tr').first()).toContainText('över 0,87');
	await expect(table.locator('tbody tr').last()).toContainText('högst 0,38');
});
