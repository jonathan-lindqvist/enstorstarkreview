import { expect } from '@playwright/test';
import {
	distanceFromMapCenter,
	emitGeolocationError,
	emitGeolocationPosition,
	installGeolocationMock,
	readGeolocationState
} from './fixtures/browser';
import { legacySlug, legacyTitle, runId, shortSlug, shortTitle, test } from './fixtures/reviews';

test.describe.serial('map', () => {
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
		await expect(page.getByRole('heading', { name: 'Hitta nästa bar på kartan.' })).toBeVisible();
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
		await expect(marker).toHaveAttribute('title', `${legacyTitle} – Pris för en stor stark: 65 kr`);
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

		await secondMarker.click();
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
		await marker.hover();
		await expect
			.poll(() => marker.evaluate((element) => window.getComputedStyle(element).backgroundColor))
			.toBe(initialMarkerBackground);

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

		const resolverResponse = await page.request.post('/karta/next-marker', {
			headers: { origin: new URL(page.url()).origin }
		});
		expect(resolverResponse.status()).toBe(401);

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
