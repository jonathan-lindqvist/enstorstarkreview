import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

interface BrowserGeolocationTestState {
	watchCallCount: number;
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
			watchCallCount: 0,
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
					state.watchCallCount += 1;
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

export const readGeolocationWatchCount = (page: Page) =>
	page.evaluate(
		() =>
			(window as typeof window & { __geolocationTest: BrowserGeolocationTestState })
				.__geolocationTest.watchCallCount
	);

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

const expectAspectRatio = async (locator: Locator, ratio: number) => {
	await expect(locator).toBeVisible();
	const bounds = await locator.boundingBox();
	if (!bounds) throw new Error('Bildytan saknar synliga dimensioner.');
	expect(bounds.width / bounds.height).toBeCloseTo(ratio, 2);
};

export const expectSixteenByNine = (locator: Locator) => expectAspectRatio(locator, 16 / 9);
export const expectSquare = (locator: Locator) => expectAspectRatio(locator, 1);

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

/** Moves the review wizard to its next step or rating aspect. */
export const nextWizardStep = (page: Page) =>
	page.getByRole('button', { name: /^Nästa: / }).click();

/** Gives every rating aspect the same value, from the first aspect on to the text step. */
export const rateEveryAspect = async (page: Page, value: number) => {
	const aspects = page.locator('fieldset[id]:visible').filter({ has: page.getByRole('radio') });
	for (let aspect = 0; aspect < 8; aspect += 1) {
		await aspects.locator(`label:has(input[value="${value}"])`).click();
		await nextWizardStep(page);
	}
	await expect(page.getByRole('heading', { name: 'Hur var helheten?' })).toBeVisible();
};

/** Opens a step from the edit overview of the review wizard. */
export const openWizardStep = async (page: Page, title: string) => {
	await page
		.getByRole('list', { name: 'Recensionens delar' })
		.getByRole('button', { name: new RegExp(`^${title}`) })
		.click();
};

/** Closes a step of the edit wizard and returns to the overview. */
export const finishWizardStep = async (page: Page) => {
	await page.getByRole('button', { name: 'Klar' }).click();
	await expect(page.getByRole('list', { name: 'Recensionens delar' })).toBeVisible();
};

/** Opens the link field of a new review, which follows the name until it is edited. */
export const fillNewReviewSlug = async (page: Page, slug: string) => {
	await page.locator('summary', { hasText: 'Länk:' }).click();
	await page.locator('#slug').fill(slug);
};

export const expectAnonymousNotFound = async (context: BrowserContext, path: string) => {
	const response = await context.request.get(path);
	expect(response.status()).toBe(404);
};
