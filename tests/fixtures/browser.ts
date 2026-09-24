import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

interface BrowserGeolocationTestState {
	watchOptions: PositionOptions | null;
	clearWatchIds: number[];
	emitPosition: (latitude: number, longitude: number, accuracy: number) => void;
	emitError: (code: number) => void;
}

export const installGeolocationMock = async (page: Page) => {
	await page.addInitScript(() => {
		let successCallback: PositionCallback | undefined;
		let errorCallback: PositionErrorCallback | undefined;
		const clearWatchStorageKey = '__playwrightGeolocationClearWatchIds';
		let recordedClearWatchIds: number[] = [];
		try {
			recordedClearWatchIds = JSON.parse(
				window.sessionStorage.getItem(clearWatchStorageKey) ?? '[]'
			) as number[];
		} catch {
			recordedClearWatchIds = [];
		}
		const state: BrowserGeolocationTestState = {
			watchOptions: null,
			clearWatchIds: recordedClearWatchIds,
			emitPosition: (latitude, longitude, accuracy) => {
				successCallback?.({
					coords: {
						latitude,
						longitude,
						accuracy,
						altitude: null,
						altitudeAccuracy: null,
						heading: null,
						speed: null,
						toJSON: () => ({})
					},
					timestamp: Date.now(),
					toJSON: () => ({})
				} as GeolocationPosition);
			},
			emitError: (code) => {
				errorCallback?.({
					code,
					message: 'Playwright-geolocation error',
					PERMISSION_DENIED: 1,
					POSITION_UNAVAILABLE: 2,
					TIMEOUT: 3
				} as GeolocationPositionError);
			}
		};

		Object.defineProperty(window, '__geolocationTest', { value: state });
		Object.defineProperty(window.navigator, 'geolocation', {
			configurable: true,
			value: {
				getCurrentPosition: () => undefined,
				watchPosition: (
					success: PositionCallback,
					error?: PositionErrorCallback | null,
					options?: PositionOptions
				) => {
					successCallback = success;
					errorCallback = error ?? undefined;
					state.watchOptions = options ?? null;
					return 73;
				},
				clearWatch: (watchId: number) => {
					state.clearWatchIds.push(watchId);
					window.sessionStorage.setItem(clearWatchStorageKey, JSON.stringify(state.clearWatchIds));
				}
			}
		});
	});
};

export const readGeolocationState = (page: Page) =>
	page.evaluate(() => {
		const state = (window as typeof window & { __geolocationTest: BrowserGeolocationTestState })
			.__geolocationTest;
		return { watchOptions: state.watchOptions, clearWatchIds: state.clearWatchIds };
	});

export const emitGeolocationPosition = (
	page: Page,
	latitude: number,
	longitude: number,
	accuracy: number
) =>
	page.evaluate(
		([nextLatitude, nextLongitude, nextAccuracy]) =>
			(
				window as typeof window & { __geolocationTest: BrowserGeolocationTestState }
			).__geolocationTest.emitPosition(nextLatitude, nextLongitude, nextAccuracy),
		[latitude, longitude, accuracy] as const
	);

export const emitGeolocationError = (page: Page, code: number) =>
	page.evaluate(
		(errorCode) =>
			(
				window as typeof window & { __geolocationTest: BrowserGeolocationTestState }
			).__geolocationTest.emitError(errorCode),
		code
	);

export const distanceFromMapCenter = (page: Page) =>
	page.evaluate(() => {
		const mapElement = document.querySelector('[aria-label="Karta över recenserade barer"]');
		const locationDot = document.querySelector('.bar-map-user-location-dot');
		if (!mapElement || !locationDot) throw new Error('Kartan eller positionsmarkören saknas.');

		const mapBounds = mapElement.getBoundingClientRect();
		const dotBounds = locationDot.getBoundingClientRect();
		return Math.hypot(
			dotBounds.left + dotBounds.width / 2 - (mapBounds.left + mapBounds.width / 2),
			dotBounds.top + dotBounds.height / 2 - (mapBounds.top + mapBounds.height / 2)
		);
	});

export const expectSixteenByNine = async (locator: Locator) => {
	await expect(locator).toBeVisible();
	const bounds = await locator.boundingBox();
	if (!bounds) throw new Error('Bildytan saknar synliga dimensioner.');
	expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 2);
};

export const expectImagePosition = async (locator: Locator, expected: string) => {
	await expect
		.poll(() => locator.evaluate((element) => window.getComputedStyle(element).objectPosition))
		.toBe(expected);
};

export const expectBackgroundPosition = async (locator: Locator, expected: string) => {
	await expect
		.poll(() => locator.evaluate((element) => window.getComputedStyle(element).backgroundPosition))
		.toBe(expected);
};

export const login = async (page: Page, username: string, password: string) => {
	await page.goto('/login');
	await page.context().addCookies([
		{
			name: 'analytics_consent',
			value: 'denied',
			url: page.url()
		}
	]);
	await page.reload();
	await page.getByLabel('Användarnamn').fill(username);
	await page.getByLabel('Lösenord').fill(password);
	await page.getByRole('button', { name: 'Logga in' }).click();
	await page.waitForURL('**/admin/reviews');
};

export const setRange = async (page: Page, field: string, value: string) => {
	await page.locator(`#${field}`).evaluate((element, nextValue) => {
		const input = element as HTMLInputElement;
		input.value = nextValue;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
};

export const expectAnonymousNotFound = async (context: BrowserContext, path: string) => {
	const response = await context.request.get(path);
	expect(response.status()).toBe(404);
};
