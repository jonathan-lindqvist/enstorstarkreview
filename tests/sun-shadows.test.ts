import { expect, type Request } from '@playwright/test';
import {
	distanceFromMapCenter,
	emitGeolocationPosition,
	installGeolocationMock
} from './fixtures/browser';
import { legacyTitle, test } from './fixtures/reviews';
import type { ShadowFrame, ShadowResult, ShadowWorkerMessage } from '../src/lib/types/sun-shadows';

type ProbedWindow = typeof window & {
	shadowProbe: { jobs: ShadowFrame[]; results: ShadowResult[]; workers: number };
};

test('sun mode updates during gestures and preserves map controls and preview', async ({
	page
}, testInfo) => {
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.addInitScript(() => {
		const host = window as ProbedWindow;
		host.shadowProbe = { jobs: [], results: [], workers: 0 };
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				if (!String(url).includes('sun-shadows.worker')) return;
				host.shadowProbe.workers++;
				const send = this.postMessage.bind(this);
				this.postMessage = (
					message: unknown,
					options?: Transferable[] | StructuredSerializeOptions
				) => {
					host.shadowProbe.jobs.push(message as ShadowFrame);
					if (Array.isArray(options)) send(message, options);
					else send(message, options);
				};
				this.addEventListener('message', ({ data }: MessageEvent<ShadowWorkerMessage>) => {
					if (!('type' in data)) host.shadowProbe.results.push(data);
				});
			}
		};
	});
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.setFixedTime(new Date('2026-06-21T10:00:00Z'));
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
		route.fulfill({
			json: {
				version: 8,
				sources: {
					openmaptiles: {
						type: 'geojson',
						data: {
							type: 'FeatureCollection',
							features: [
								{
									type: 'Feature',
									properties: { render_height: 30, render_min_height: 0 },
									geometry: {
										type: 'Polygon',
										coordinates: [
											[
												[12.0298, 57.7198],
												[12.0302, 57.7198],
												[12.0302, 57.7202],
												[12.0298, 57.7202],
												[12.0298, 57.7198]
											]
										]
									}
								}
							]
						}
					}
				},
				layers: [
					{ id: 'building', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': '#bbb' } }
				]
			}
		})
	);
	await page.goto('/karta');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await emitGeolocationPosition(page, 57.72, 12.03, 20);
	await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
	const marker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
	const before = (await marker.locator('..').boundingBox())!;
	const toggle = page.getByRole('button', { name: 'Sol/skugga', exact: true });
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Zooma in för att se skuggor.', { exact: true })).toBeVisible();
	const after = (await marker.locator('..').boundingBox())!;
	// MapLibre rounds marker positions on moveend, while resize can retain half pixels.
	expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.5);
	expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
	expect(after.width).toBe(before.width);
	expect(after.height).toBe(before.height);
	const canvas = page.locator('.maplibregl-canvas');
	for (let step = 0; step < 3; step++) {
		await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
	}
	await expect(page.getByText('Beräknade byggnadsskuggor.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2026-06-22');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Välj datum och tid för skuggor' })).toContainText(
		'22/6'
	);
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2026-06-21');
	await page.getByLabel('Tid på dagen', { exact: true }).fill('360');
	await page.keyboard.press('Escape');
	await expect
		.poll(() =>
			page.evaluate(() => {
				const { jobs, results } = (window as ProbedWindow).shadowProbe;
				return jobs.find((job) => job.id === results.at(-1)?.id)?.timestamp;
			})
		)
		.toBe(Date.parse('2026-06-21T04:00:00Z'));
	const morning = await canvas.screenshot();
	const sliderRequests: string[] = [];
	const recordSliderRequest = (request: Request) => sliderRequests.push(request.url());
	page.on('request', recordSliderRequest);
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	const slider = page.getByLabel('Tid på dagen', { exact: true });
	const range = (await slider.boundingBox())!;
	const initialFrame = await page.evaluate(() => {
		const { id, timestamp } = (window as ProbedWindow).shadowProbe.jobs.at(-1)!;
		return { id, timestamp };
	});
	await page.mouse.move(
		range.x + 8 + (range.width - 16) * (360 / 1435),
		range.y + range.height / 2
	);
	await page.mouse.down();
	for (let step = 0; step < 25; step++) {
		await page.mouse.move(
			range.x + 8 + (range.width - 16) * (0.25 + step / 60),
			range.y + range.height / 2
		);
		await page.waitForTimeout(40);
	}
	const sliderFrames = await page.evaluate((initialFrame) => {
		const { jobs, results, workers } = (window as ProbedWindow).shadowProbe;
		return {
			workers,
			changed: results.some(
				(result) =>
					result.id > initialFrame.id &&
					result.status === 'ready' &&
					result.data.features.length > 0 &&
					jobs.find((job) => job.id === result.id)!.timestamp !== initialFrame.timestamp
			)
		};
	}, initialFrame);
	expect(sliderFrames).toEqual({ workers: 1, changed: true });
	await page.mouse.up();
	const selectedMinute = Number(await slider.inputValue());
	await expect
		.poll(() =>
			page.evaluate(() => {
				const { jobs, results } = (window as ProbedWindow).shadowProbe;
				return jobs.find((job) => job.id === results.at(-1)?.id)?.timestamp;
			})
		)
		.toBe(Date.parse('2026-06-20T22:00:00Z') + selectedMinute * 60_000);
	page.off('request', recordSliderRequest);
	expect(sliderRequests).toEqual([]);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await slider.fill('900');
	await page.keyboard.press('Escape');
	await expect.poll(async () => (await canvas.screenshot()).equals(morning)).toBe(false);
	const initialPanFrame = await page.evaluate(() => {
		const { id, bounds } = (window as ProbedWindow).shadowProbe.jobs.at(-1)!;
		return { id, bounds: JSON.stringify(bounds) };
	});
	const mapBounds = (await canvas.boundingBox())!;
	const dragX = mapBounds.x + mapBounds.width * 0.6;
	const dragY = mapBounds.y + mapBounds.height * 0.65;
	await page.mouse.move(dragX, dragY);
	await page.mouse.down();
	for (let step = 1; step <= 25; step++) {
		await page.mouse.move(dragX + step * 4, dragY + step);
		await page.waitForTimeout(40);
	}
	const panFrame = await page.evaluate((initialPanFrame) => {
		const { jobs, results } = (window as ProbedWindow).shadowProbe;
		return results.some(
			(result) =>
				result.id > initialPanFrame.id &&
				result.status === 'ready' &&
				JSON.stringify(jobs.find((job) => job.id === result.id)!.bounds) !== initialPanFrame.bounds
		);
	}, initialPanFrame);
	expect(panFrame).toBe(true);
	await page.mouse.up();
	await marker.focus();
	await marker.press('Enter');
	const preview = page.getByRole('region', { name: `Information om ${legacyTitle}` });
	const previewBounds = (await preview.boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(viewport.height - previewBounds.y - previewBounds.height).toBeCloseTo(16);
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).focus();
	await page.keyboard.press('Escape');
	await expect(preview).toBeVisible();
	await expect(page.getByRole('button', { name: 'Välj datum och tid för skuggor' })).toBeFocused();
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2027-06-21');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Välj datum och tid för skuggor' })).toContainText(
		'21/6 2027'
	);
	for (const viewport of [
		{ width: 320, height: 568 },
		{ width: 375, height: 812 },
		{ width: 667, height: 375 },
		{ width: 1280, height: 900 }
	]) {
		await page.setViewportSize(viewport);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((theme) => {
				document.documentElement.dataset.theme = theme;
				window.dispatchEvent(new Event('themechange'));
			}, theme);
			await expect(page.getByText('Beräknade byggnadsskuggor.', { exact: true })).toBeVisible();
			const card = (await preview.boundingBox())!;
			expect(viewport.height - card.y - card.height).toBeCloseTo(16);
			await expect(toggle).toBeInViewport({ ratio: 1 });
			await expect(
				page.getByRole('button', { name: 'Välj datum och tid för skuggor' })
			).toBeInViewport({ ratio: 1 });
			await page.screenshot({
				animations: 'disabled',
				path: testInfo.outputPath(`sun-${viewport.width}-${theme}.png`)
			});
		}
	}
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2026-12-21');
	await page.getByLabel('Tid på dagen', { exact: true }).fill('0');
	await page.keyboard.press('Escape');
	await expect(page.getByText('Solen är nere vid vald tid.', { exact: true })).toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByText('Beräknade byggnadsskuggor.', { exact: true })).toHaveCount(0);
});

test('sun controls handle missing buildings and invalid dates without losing the map', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.setFixedTime(new Date('2026-06-21T10:00:00Z'));
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
		route.fulfill({
			json: { version: 8, sources: {}, layers: [] }
		})
	);
	await page.goto('/karta');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	for (let step = 0; step < 3; step++)
		await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await page.getByRole('button', { name: 'Sol/skugga', exact: true }).click();
	await expect(
		page.getByText('Skuggorna kunde inte beräknas. Zooma in eller försök igen.', { exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Välj datum och tid för skuggor' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('');
	await expect(page.getByText('Välj ett giltigt datum.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Nu', exact: true }).click();
	await expect(page.getByLabel('Datum', { exact: true })).toHaveValue('2026-06-21');
	await expect(page.getByText('Välj ett giltigt datum.', { exact: true })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Sol/skugga', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Kartmeddelanden', exact: true })).toHaveCount(0);
});

test('sun mode tolerates a blocked calculation worker while bar markers stay usable', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/*', (route) =>
		route.fulfill({
			json: {
				version: 8,
				sources: {
					openmaptiles: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
				},
				layers: [{ id: 'building', type: 'fill', source: 'openmaptiles' }]
			}
		})
	);
	await page.goto('/karta');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	for (let step = 0; step < 3; step++)
		await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await page.evaluate(() => {
		window.Worker = class {
			constructor() {
				throw new Error('Worker unavailable');
			}
		} as unknown as typeof Worker;
	});
	await page.getByRole('button', { name: 'Sol/skugga', exact: true }).click();
	await expect(
		page.getByText('Skuggorna kunde inte beräknas. Zooma in eller försök igen.', { exact: true })
	).toBeVisible();
	const marker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
	await marker.focus();
	await marker.press('Enter');
	await expect(page.getByRole('link', { name: 'Läs recension', exact: true })).toBeVisible();
});
