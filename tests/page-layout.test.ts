import { expect } from '@playwright/test';
import {
	distanceFromMapCenter,
	emitGeolocationError,
	emitGeolocationPosition,
	installGeolocationMock,
	readGeolocationWatchCount
} from './fixtures/browser';
import { legacyTitle, test } from './fixtures/reviews';

test('FAQ and settings headings sit above their content panels', async ({ page }, testInfo) => {
	for (const [path, title, content] of [
		['/about', 'Vanliga frågor', 'Hur recenserar ni?'],
		['/installningar', 'Inställningar', 'Platsåtkomst']
	]) {
		await page.goto(path);
		if (path === '/about') {
			await page.getByRole('button', { name: 'Avböj', exact: true }).click();
		}
		const heading = page.getByRole('heading', { name: title, exact: true });
		const panel = page.locator('.glass-panel').filter({
			has: page.getByRole('heading', { name: content, exact: true })
		});
		const headingBounds = await heading.boundingBox();
		const panelBounds = await panel.boundingBox();
		expect(panelBounds!.y - headingBounds!.y - headingBounds!.height).toBeGreaterThanOrEqual(24);
		await expect(page.getByRole('contentinfo')).toBeVisible();
		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await page.screenshot({
					path: testInfo.outputPath(`${path.slice(1)}-${width}-${theme}.png`),
					fullPage: true
				});
			}
		}
	}
});

test('map status messages remain readable below controls on a short screen', async ({ page }) => {
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/*', (route) => route.abort());
	await page.setViewportSize({ width: 667, height: 375 });
	await page.goto('/karta?attributes=karaoke');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationError(page, 1);
	for (const message of [
		'Inga barer matchar dina filter.',
		'Kartan kunde inte laddas just nu. Försök igen om en liten stund.',
		'Platsåtkomst nekades. Ändra behörigheten i webbläsaren om du vill visa din position.'
	]) {
		const status = page.getByText(message, { exact: true });
		await status.scrollIntoViewIfNeeded();
		await expect(status).toBeInViewport({ ratio: 1 });
		await expect(page.getByRole('heading', { name: 'Karta', exact: true })).toBeInViewport({
			ratio: 1
		});
	}
	expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
		true
	);
});

test('statistics panels share padding, edges, and gaps at every breakpoint', async ({
	page
}, testInfo) => {
	await page.goto('/statistik');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	const names = ['Överblick', 'Billigast och dyrast', 'Öl för pengarna', 'Snittpris per ölmärke'];
	for (const width of [320, 375, 640, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			if (width === 1280) {
				const subtitle = page.getByText(
					'Allt bygger på publicerade recensioner. Snittpriser och prisjämförelser bygger på ordinarie priser.',
					{ exact: true }
				);
				const lineCount = await subtitle.evaluate((element) => {
					const range = document.createRange();
					range.selectNodeContents(element);
					return range.getClientRects().length;
				});
				expect(lineCount).toBe(1);
			}
			const bounds = [];
			for (const name of names) {
				const panel = page.getByRole('region', { name, exact: true });
				const padding = await panel.evaluate((element) => {
					const style = getComputedStyle(element);
					return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
				});
				expect(padding, `${name}, ${width}px`).toEqual(
					Array(4).fill(width < 640 ? '24px' : '32px')
				);
				bounds.push((await panel.boundingBox())!);
			}
			const [overview, prices, value, brands] = bounds;
			expect(value.x).toBeCloseTo(overview.x);
			expect(brands.x).toBeCloseTo(overview.x);
			expect(brands.width).toBeCloseTo(value.width);
			expect(brands.y - value.y - value.height).toBeCloseTo(24);
			if (width >= 1024) {
				expect(prices.y).toBeCloseTo(overview.y);
				expect(prices.height).toBeCloseTo(overview.height);
				expect(prices.x - overview.x - overview.width).toBeCloseTo(24);
			} else {
				expect(prices.y - overview.y - overview.height).toBeCloseTo(24);
				expect(value.y - prices.y - prices.height).toBeCloseTo(24);
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
			if (width === 375 || width === 1280) {
				await page.screenshot({
					path: testInfo.outputPath(`statistics-${width}-${theme}.png`),
					fullPage: true
				});
			}
		}
	}
});

test('map fills the viewport and keeps overlays usable while resizing and navigating', async ({
	page
}, testInfo) => {
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
		route.fulfill({
			json: {
				version: 8,
				sources: {
					fixture: {
						type: 'geojson',
						data: { type: 'FeatureCollection', features: [] },
						attribution: 'OpenFreeMap | © OpenMapTiles Data from OpenStreetMap'
					}
				},
				layers: [{ id: 'fixture', type: 'circle', source: 'fixture' }]
			}
		})
	);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/karta');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	const map = page.locator('[aria-label="Karta över recenserade barer"]');
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	for (const viewport of [
		{ width: 375, height: 812 },
		{ width: 1280, height: 900 },
		{ width: 667, height: 375 }
	]) {
		await page.setViewportSize(viewport);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			const navigation = await page
				.getByRole('navigation', { name: 'Huvudmeny' })
				.locator('..')
				.boundingBox();
			const bounds = (await map.boundingBox())!;
			expect(bounds.x).toBe(0);
			expect(bounds.width).toBe(viewport.width);
			expect(bounds.y).toBeCloseTo(navigation!.y + navigation!.height);
			expect(bounds.y + bounds.height).toBeCloseTo(viewport.height);
			await expect(page.getByRole('contentinfo')).toHaveCount(0);
			await expect(page.getByRole('heading', { name: 'Karta', exact: true })).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
				true
			);
			const filterButton = page.getByRole('button', { name: 'Filter', exact: true });
			await filterButton.click();
			const filters = page.getByRole('group', { name: 'Filtrera på aktiviteter och utbud' });
			await expect(filters).toBeVisible();
			expect(await map.boundingBox()).toEqual(bounds);
			const filterBounds = (await filters.boundingBox())!;
			expect(filterBounds.x).toBeGreaterThanOrEqual(0);
			expect(filterBounds.x + filterBounds.width).toBeLessThanOrEqual(viewport.width);
			expect(filterBounds.y + filterBounds.height).toBeLessThanOrEqual(viewport.height);
			await filters.getByRole('button', { name: 'Quiz', exact: true }).focus();
			await page.keyboard.press('Escape');
			await expect(filters).toBeHidden();
			await expect(filterButton).toBeFocused();
			await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
			await emitGeolocationPosition(page, 57.72, 12.03, 20);
			if (viewport.width === 375) {
				await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
			}
			const marker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
			await marker.focus();
			await page.keyboard.press('Enter');
			const preview = page.getByRole('region', { name: `Information om ${legacyTitle}` });
			await expect(preview).toBeVisible();
			await expect(preview.getByRole('link', { name: 'Läs recension' })).toBeInViewport({
				ratio: 1
			});
			const previewBounds = (await preview.boundingBox())!;
			expect(previewBounds.y).toBeGreaterThanOrEqual(bounds.y);
			expect(previewBounds.y + previewBounds.height).toBeLessThan(viewport.height - 20);
			const attributionBounds = (await page.locator('.maplibregl-ctrl-attrib').boundingBox())!;
			expect(previewBounds.y + previewBounds.height).toBeLessThanOrEqual(attributionBounds.y - 8);
			await page.screenshot({ path: testInfo.outputPath(`map-${viewport.width}-${theme}.png`) });
			await filterButton.click();
			await filters.getByRole('button', { name: 'Quiz', exact: true }).focus();
			await page.keyboard.press('Escape');
			await expect(filters).toBeHidden();
			await expect(preview).toBeVisible();
			await expect(filterButton).toBeFocused();
			await page.keyboard.press('Escape');
			await expect(preview).toHaveCount(0);
			await expect(marker).toBeFocused();
		}
	}
	await page.getByRole('button', { name: 'Meny', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Meny', exact: true })
		.getByRole('link', { name: 'FAQ' })
		.click();
	await expect(page.getByRole('heading', { name: 'Vanliga frågor', exact: true })).toBeVisible();
	await expect(page.getByRole('contentinfo')).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Meny', exact: true })).toBeHidden();
});
