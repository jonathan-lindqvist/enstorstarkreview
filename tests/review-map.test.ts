import { expect } from '@playwright/test';
import sharp from 'sharp';
import {
	distanceFromMapCenter,
	emitGeolocationError,
	emitGeolocationPosition,
	installGeolocationMock,
	readGeolocationState
} from './fixtures/browser';
import { legacySlug, legacyTitle, runId, shortSlug, shortTitle, test } from './fixtures/reviews';

test('dark basemap shows building height with sun and shade off', async ({ baseURL, page }) => {
	await page.setViewportSize({ width: 800, height: 600 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.context().addCookies([{ name: 'theme', value: 'dark', url: baseURL! }]);
	await installGeolocationMock(page);
	await page.route('https://tiles.openfreemap.org/styles/dark', (route) =>
		route.fulfill({
			json: {
				version: 8,
				sources: {
					openmaptiles: {
						type: 'geojson',
						data: {
							type: 'Feature',
							properties: { render_height: 260, render_min_height: 0 },
							geometry: {
								type: 'Polygon',
								coordinates: [
									[
										[11.97545, 57.7089],
										[11.97595, 57.7089],
										[11.97595, 57.70868],
										[11.97545, 57.70868],
										[11.97545, 57.7089]
									]
								]
							}
						}
					}
				},
				layers: [
					{ id: 'background', type: 'background', paint: { 'background-color': '#0c0c0c' } },
					{
						id: 'building',
						type: 'fill',
						source: 'openmaptiles',
						paint: { 'fill-color': '#0a0a0a' }
					}
				]
			}
		})
	);
	await page.goto('/karta');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	const canvas = page.locator('.maplibregl-canvas');
	await expect(canvas).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sol/skugga', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	for (let step = 0; step < 3; step++)
		await page.getByRole('button', { name: 'Zoom in', exact: true }).click();

	// Perspective projects the tall roof past its ground footprint, even with the camera level.
	await expect
		.poll(async () => {
			const image = sharp(await canvas.screenshot({ scale: 'css' }));
			const { width, height } = await image.metadata();
			const pixel = await image
				.extract({
					left: Math.floor(width / 2) + 108,
					top: Math.floor(height / 2) + 18,
					width: 1,
					height: 1
				})
				.raw()
				.toBuffer();
			return pixel[0];
		})
		.toBeGreaterThan(30);
});

test.describe.serial('map', () => {
	test('sanitizes adjacent malicious attribution attributes from an external map style', async ({
		page
	}) => {
		await installGeolocationMock(page);
		await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
			route.fulfill({
				json: {
					version: 8,
					sources: {
						fixture: {
							type: 'geojson',
							data: { type: 'FeatureCollection', features: [] },
							attribution:
								'<details open onload="window.__attributionXss = true" ontoggle="window.__attributionXss = true">Kartkälla <a href="https://example.org/">Kartdata</a></details>'
						}
					},
					layers: [{ id: 'fixture', type: 'circle', source: 'fixture' }]
				}
			})
		);

		await page.goto('/karta');
		const attribution = page.locator('.maplibregl-ctrl-attrib-inner');
		await expect(attribution).toContainText('Kartkälla');
		await expect(attribution.getByRole('link', { name: 'Kartdata' })).toHaveAttribute(
			'href',
			'https://example.org/'
		);
		const unsafeAttributes = await attribution.evaluate((element) =>
			Array.from(element.querySelectorAll('*')).flatMap((child) =>
				Array.from(child.attributes)
					.filter((attribute) => attribute.name.startsWith('on'))
					.map((attribute) => attribute.name)
			)
		);
		expect(unsafeAttributes).toEqual([]);
		expect(
			await page.evaluate(
				() => (window as typeof window & { __attributionXss?: boolean }).__attributionXss
			)
		).toBeUndefined();
	});

	test('shows resolved public reviews on the map but excludes drafts', async ({ page }) => {
		await installGeolocationMock(page);
		await page.setViewportSize({ width: 390, height: 844 });
		const nominatimRequests: string[] = [];
		const applicationLocationRequests: string[] = [];
		page.on('request', (request) => {
			const url = new URL(request.url());
			if (url.hostname === 'nominatim.openstreetmap.org') nominatimRequests.push(request.url());
			if (url.pathname.includes('location') || url.pathname.includes('position')) {
				applicationLocationRequests.push(request.url());
			}
		});

		const mapResponse = await page.goto('/karta');
		expect(mapResponse?.headers()['permissions-policy']).toBe(
			'camera=(), microphone=(), geolocation=(self)'
		);
		await expect(page.getByRole('heading', { name: 'Karta', exact: true })).toBeVisible();
		await expect
			.poll(() => readGeolocationState(page))
			.toEqual({
				watchOptions: { enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 },
				clearWatchIds: []
			});

		await emitGeolocationPosition(page, 57.72, 12.03, 300);
		const userLocation = page.getByRole('img', { name: 'Din aktuella position' });
		const locationDot = userLocation.locator('.bar-map-user-location-dot');
		const accuracyCircle = userLocation.locator('.bar-map-user-location-accuracy');
		await expect(userLocation).toBeAttached();
		await expect(locationDot).toBeVisible();
		await expect(accuracyCircle).toBeAttached();
		await expect.poll(() => distanceFromMapCenter(page), { timeout: 3_000 }).toBeLessThan(4);
		const locationStructure = await userLocation.evaluate((element) => ({
			positionerWidth: element.getBoundingClientRect().width,
			positionerHeight: element.getBoundingClientRect().height,
			positionerPointerEvents: window.getComputedStyle(element).pointerEvents,
			dotPointerEvents: window.getComputedStyle(
				element.querySelector('.bar-map-user-location-dot')!
			).pointerEvents,
			accuracyWidth: element
				.querySelector('.bar-map-user-location-accuracy')!
				.getBoundingClientRect().width
		}));
		expect(locationStructure).toMatchObject({
			positionerWidth: 0,
			positionerHeight: 0,
			positionerPointerEvents: 'none',
			dotPointerEvents: 'none'
		});
		expect(locationStructure.accuracyWidth).toBeGreaterThan(0);

		await emitGeolocationPosition(page, 57.72, 12.06, 120);
		await expect.poll(() => distanceFromMapCenter(page), { timeout: 3_000 }).toBeGreaterThan(20);
		expect(nominatimRequests).toEqual([]);
		expect(applicationLocationRequests).toEqual([]);

		await emitGeolocationError(page, 2);
		await expect(page.getByText('Din position kunde inte hämtas just nu.')).toBeVisible();
		await emitGeolocationPosition(page, 57.72, 12.06, 120);
		await expect(page.getByText('Din position kunde inte hämtas just nu.')).toHaveCount(0);

		const marker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
		const secondMarker = page.getByRole('button', { name: `Visa ${shortTitle} på kartan` });
		await expect(marker).toBeVisible();
		await expect(secondMarker).toBeVisible();
		const positioner = marker.locator('..');
		const secondPositioner = secondMarker.locator('..');
		const priceLabel = positioner.locator('.bar-map-marker-price');
		const secondPriceLabel = secondPositioner.locator('.bar-map-marker-price');
		await expect(priceLabel).toHaveText('65 kr');
		await expect(secondPriceLabel).toHaveText('65 kr');
		await expect(priceLabel).toHaveAttribute('title', 'Pris för en stor stark: 65 kr');
		await expect(marker).toHaveAttribute('title', `${legacyTitle} | Pris för en stor stark: 65 kr`);
		await expect(marker).toHaveAttribute('aria-pressed', 'false');
		await expect(secondMarker).toHaveAttribute('aria-pressed', 'false');
		await expect(
			page.getByRole('button', { name: `Visa Annat utkast ${runId} på kartan` })
		).toHaveCount(0);

		const markerStructure = await marker.evaluate((element) => {
			const positioner = element.parentElement;
			if (!positioner) throw new Error('Kartmarkören saknar positionselement.');

			return {
				buttonIsMapLibreMarker: element.classList.contains('maplibregl-marker'),
				buttonTransitionProperties: window.getComputedStyle(element).transitionProperty,
				positionerIsMapLibreMarker: positioner.classList.contains('maplibregl-marker'),
				positionerTransitionProperties: window.getComputedStyle(positioner).transitionProperty,
				positionerWidth: positioner.getBoundingClientRect().width,
				pricePointerEvents: window.getComputedStyle(
					positioner.querySelector('.bar-map-marker-price')!
				).pointerEvents,
				pricePosition: window.getComputedStyle(positioner.querySelector('.bar-map-marker-price')!)
					.position,
				priceLeft: positioner.querySelector('.bar-map-marker-price')!.getBoundingClientRect().left,
				positionerRight: positioner.getBoundingClientRect().right
			};
		});
		expect(markerStructure.buttonIsMapLibreMarker).toBe(false);
		expect(markerStructure.positionerIsMapLibreMarker).toBe(true);
		expect(
			markerStructure.buttonTransitionProperties.split(',').map((value) => value.trim())
		).toContain('transform');
		expect(
			markerStructure.positionerTransitionProperties.split(',').map((value) => value.trim())
		).not.toContain('transform');
		expect(markerStructure.positionerWidth).toBeCloseTo(32);
		expect(markerStructure.pricePointerEvents).toBe('none');
		expect(markerStructure.pricePosition).toBe('absolute');
		expect(markerStructure.priceLeft).toBeGreaterThan(markerStructure.positionerRight);

		const priceDescriptionId = await marker.getAttribute('aria-describedby');
		expect(priceDescriptionId).toBeTruthy();
		await expect(page.locator(`#${priceDescriptionId}`)).toHaveText(
			'Pris för en stor stark: 65 kr.'
		);

		const initialPriceBackground = await priceLabel.evaluate(
			(element) => window.getComputedStyle(element).backgroundColor
		);
		const initialMarkerBackground = await marker.evaluate(
			(element) => window.getComputedStyle(element).backgroundColor
		);
		await marker.click();
		await expect(page.getByRole('heading', { name: legacyTitle })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Läs recension' })).toHaveAttribute(
			'href',
			`/${legacySlug}`
		);
		await expect(marker).toHaveAttribute('aria-pressed', 'true');
		await expect(secondMarker).toHaveAttribute('aria-pressed', 'false');
		await expect
			.poll(() =>
				priceLabel.evaluate((element) => window.getComputedStyle(element).backgroundColor)
			)
			.not.toBe(initialPriceBackground);

		// The mobile preview can cover this marker; native keyboard activation still switches it.
		await secondMarker.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: shortTitle })).toBeVisible();
		await expect(page.getByRole('heading', { name: legacyTitle })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Läs recension' })).toHaveAttribute(
			'href',
			`/${shortSlug}`
		);
		await expect(marker).toHaveAttribute('aria-pressed', 'false');
		await expect(secondMarker).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.bar-map-marker.is-selected')).toHaveCount(1);
		await expect(page.locator('.bar-map-marker-positioner.is-selected')).toHaveCount(1);
		await expect
			.poll(() =>
				priceLabel.evaluate((element) => window.getComputedStyle(element).backgroundColor)
			)
			.toBe(initialPriceBackground);
		const preview = page.locator(`section[aria-label="Information om ${shortTitle}"]`);
		const previewZIndex = await preview.evaluate(
			(element) => window.getComputedStyle(element).zIndex
		);
		const selectedMarkerZIndex = await secondPositioner.evaluate(
			(element) => window.getComputedStyle(element).zIndex
		);
		expect(Number(previewZIndex)).toBeGreaterThan(Number(selectedMarkerZIndex));

		await page.getByRole('button', { name: 'Stäng förhandsvisning' }).click();
		await expect(page.getByRole('heading', { name: shortTitle })).toHaveCount(0);
		await expect(secondMarker).toBeFocused();
		await expect(secondMarker).toHaveAttribute('aria-pressed', 'false');
		await expect
			.poll(() =>
				secondPriceLabel.evaluate((element) => window.getComputedStyle(element).backgroundColor)
			)
			.toBe(initialPriceBackground);
		// The mobile preview intentionally covers markers; hover only after it closes.
		await marker.hover();
		await expect
			.poll(() => marker.evaluate((element) => window.getComputedStyle(element).backgroundColor))
			.toBe(initialMarkerBackground);

		const resolverResponse = await page.request.post('/karta/next-marker', {
			headers: { origin: new URL(page.url()).origin }
		});
		expect(resolverResponse.status()).toBe(401);

		await page.getByRole('button', { name: 'Meny' }).click();
		await page.getByRole('link', { name: 'FAQ' }).click();
		await expect(page).toHaveURL(/\/about$/);
		await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toEqual([73]);
		const mapPrivacyFaq = page
			.getByRole('heading', { name: 'Hur fungerar kartan och integriteten?' })
			.locator('..');
		await expect(mapPrivacyFaq).toContainText(
			'Vi skickar inte positionen till vår server eller Nominatim och sparar den inte.'
		);
		await expect(mapPrivacyFaq).toContainText(
			'OpenFreeMap behandla teknisk anslutningsdata och vilket kartområde som visas'
		);
	});

	test('automatically uses browser-granted location without a button', async ({ page }) => {
		await page.context().grantPermissions(['geolocation']);
		await page.context().setGeolocation({ latitude: 57.72, longitude: 12.03, accuracy: 80 });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/karta');

		const userLocation = page.getByRole('img', { name: 'Din aktuella position' });
		await expect(userLocation).toBeAttached();
		await expect(userLocation.locator('.bar-map-user-location-dot')).toBeVisible();
		await expect.poll(() => distanceFromMapCenter(page), { timeout: 3_000 }).toBeLessThan(4);
		await expect(page.locator('.maplibregl-ctrl-geolocate')).toHaveCount(0);
	});

	test('does not recenter after map interaction before the first location', async ({ page }) => {
		await installGeolocationMock(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/karta');
		await expect
			.poll(() => readGeolocationState(page))
			.toEqual({
				watchOptions: { enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 },
				clearWatchIds: []
			});

		await page.locator('[aria-label="Karta över recenserade barer"]').dispatchEvent('pointerdown');
		await emitGeolocationPosition(page, 57.72, 12.03, 100);
		await expect(page.getByRole('img', { name: 'Din aktuella position' })).toBeAttached();
		await expect.poll(() => distanceFromMapCenter(page), { timeout: 3_000 }).toBeGreaterThan(20);
	});

	test('reports denied location permission without breaking the map', async ({ page }) => {
		await installGeolocationMock(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/karta');
		await expect
			.poll(() => readGeolocationState(page))
			.toEqual({
				watchOptions: { enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 },
				clearWatchIds: []
			});

		await emitGeolocationError(page, 1);
		await expect(
			page.getByText(
				'Platsåtkomst nekades. Ändra behörigheten i webbläsaren om du vill visa din position.'
			)
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` })
		).toBeAttached();
	});
});
