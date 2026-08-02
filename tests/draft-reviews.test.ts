import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from 'argon2';
import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';

const runId = `${Date.now()}-${process.pid}`;
const draftSlug = `playwright-utkast-${runId}`;
const legacySlug = `playwright-legacy-${runId}`;
const shortSlug = `playwright-kort-${runId}`;
const decoySlug = `playwright-annat-utkast-${runId}`;
const draftTitle = `Playwright-utkast ${runId}`;
const legacyTitle = `Playwright-legacy ${runId}`;
const shortTitle = `Playwright-kort ${runId}`;
const legacyAddress = `Legacygatan ${runId}`;
const legacyMarkdownDescription = `## Helhetsintryck

En **minnesvärd** och *livlig* bar med ett väldigt långt omdöme som fortsätter för att kortet ska behöva klippa innehållet visuellt.

- Första detaljen som är värd att komma ihåg
- Andra detaljen som också är värd att komma ihåg

1. Börja med en stor stark
2. Stanna kvar för stämningen`;
const publisherUsername = `publisher-${process.pid}`;
const publisherPassword = 'publisher-test-password';
const fixtureImagePath = join(process.cwd(), 'src', 'lib', 'images', 'image.png');
const reviewImageDirectory =
	process.env.REVIEW_IMAGE_DIR ??
	(process.env.PLAYWRIGHT_TEST_BASE_URL
		? join(process.cwd(), 'uploads', 'images')
		: join(tmpdir(), 'enstorstarkreview-playwright-images'));
const legacyImage = `${new ObjectId().toHexString()}.png`;
const integrationStartedAt = new Date();

let client: MongoClient | undefined;
let database: Db;
let bars: Collection;
let auditLogs: Collection;
let users: Collection;
let loginRateLimits: Collection;
let mapGeocodes: Collection;
let databaseReady = false;
let draftImage: string | undefined;
let originalLoginRateLimits: Document[] = [];

interface BrowserGeolocationTestState {
	watchOptions: PositionOptions | null;
	clearWatchIds: number[];
	emitPosition: (latitude: number, longitude: number, accuracy: number) => void;
	emitError: (code: number) => void;
}

const installGeolocationMock = async (page: Page) => {
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

const readGeolocationState = (page: Page) =>
	page.evaluate(() => {
		const state = (window as typeof window & { __geolocationTest: BrowserGeolocationTestState })
			.__geolocationTest;
		return { watchOptions: state.watchOptions, clearWatchIds: state.clearWatchIds };
	});

const emitGeolocationPosition = (
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

const emitGeolocationError = (page: Page, code: number) =>
	page.evaluate(
		(errorCode) =>
			(
				window as typeof window & { __geolocationTest: BrowserGeolocationTestState }
			).__geolocationTest.emitError(errorCode),
		code
	);

const distanceFromMapCenter = (page: Page) =>
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

const login = async (page: Page, username: string, password: string) => {
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

const setRange = async (page: Page, field: string, value: string) => {
	await page.locator(`#${field}`).evaluate((element, nextValue) => {
		const input = element as HTMLInputElement;
		input.value = nextValue;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
};

const expectAnonymousNotFound = async (context: BrowserContext, path: string) => {
	const response = await context.request.get(path);
	expect(response.status()).toBe(404);
};

test.describe.serial('draft review publication', () => {
	test.beforeAll(async () => {
		const mongoUri = process.env.MONGO_URI;
		if (!mongoUri) {
			throw new Error('MONGO_URI is required for the draft review integration tests');
		}

		client = new MongoClient(mongoUri);
		await client.connect();
		database = client.db('enstorstark');
		bars = database.collection('bars');
		auditLogs = database.collection('audit_logs');
		users = database.collection('users');
		loginRateLimits = database.collection('login_rate_limits');
		mapGeocodes = database.collection('map_geocodes');
		databaseReady = true;

		originalLoginRateLimits = await loginRateLimits.find({}).toArray();
		await loginRateLimits.deleteMany({});

		const creatorExists = await users.countDocuments({ username: 'test' });
		if (creatorExists !== 1) {
			throw new Error('The Docker development user test is required');
		}

		await users.insertOne({
			_id: new ObjectId(),
			username: publisherUsername,
			password: await hash(publisherPassword)
		});

		await mkdir(reviewImageDirectory, { recursive: true });
		await copyFile(fixtureImagePath, join(reviewImageDirectory, legacyImage));

		const now = new Date();
		await bars.insertMany([
			{
				_id: new ObjectId(),
				title: legacyTitle,
				description: legacyMarkdownDescription,
				atmosphere: 4,
				service: 4,
				selection: 4,
				quality: 4,
				price: 4,
				cleanliness: 4,
				soundLevel: 4,
				barhopPotential: 4,
				rating: 2,
				image: legacyImage,
				location: legacyAddress,
				slug: legacySlug,
				beerPriceKr: 65,
				isHappyHourPrice: false,
				author: 'test',
				coAuthors: [],
				changeLog: [],
				createdAt: now,
				updatedAt: now
			},
			{
				_id: new ObjectId(),
				title: shortTitle,
				description: 'En **kort** recension.',
				atmosphere: 4,
				service: 4,
				selection: 4,
				quality: 4,
				price: 4,
				cleanliness: 4,
				soundLevel: 4,
				barhopPotential: 4,
				rating: 2,
				image: legacyImage,
				location: 'Kortgatan 1',
				slug: shortSlug,
				beerPriceKr: 65,
				isHappyHourPrice: false,
				author: 'test',
				coAuthors: [],
				publicationStatus: 'published',
				changeLog: [],
				createdAt: now,
				updatedAt: now
			},
			{
				_id: new ObjectId(),
				title: `Annat utkast ${runId}`,
				description: 'Ett annat utkast som aldrig ska publiceras av det här anropet.',
				atmosphere: 3,
				service: 3,
				selection: 3,
				quality: 3,
				price: 3,
				cleanliness: 3,
				soundLevel: 3,
				barhopPotential: 3,
				rating: 2,
				image: `${new ObjectId().toHexString()}.png`,
				location: 'Testgatan 2',
				slug: decoySlug,
				beerPriceKr: 60,
				isHappyHourPrice: false,
				author: 'test',
				coAuthors: [],
				publicationStatus: 'draft',
				changeLog: [],
				createdAt: now,
				updatedAt: now
			}
		]);
		await mapGeocodes.insertOne({
			addressKey: legacyAddress.toLocaleLowerCase('sv-SE'),
			address: legacyAddress,
			status: 'resolved',
			latitude: 59.3293,
			longitude: 18.0686,
			updatedAt: now
		});
	});

	test.afterAll(async () => {
		if (!databaseReady) {
			await client?.close();
			return;
		}

		const createdReview = await bars.findOne({ slug: draftSlug }, { projection: { image: 1 } });
		draftImage = createdReview?.image as string | undefined;

		await bars.deleteMany({ slug: { $in: [draftSlug, legacySlug, shortSlug, decoySlug] } });
		await auditLogs.deleteMany({
			targetSlug: { $in: [draftSlug, legacySlug, shortSlug, decoySlug] }
		});
		await auditLogs.deleteMany({ username: publisherUsername });
		await auditLogs.deleteMany({
			eventType: 'login_attempt',
			username: 'test',
			createdAt: { $gte: integrationStartedAt }
		});
		await users.deleteOne({ username: publisherUsername });
		await mapGeocodes.deleteOne({ addressKey: legacyAddress.toLocaleLowerCase('sv-SE') });
		await loginRateLimits.deleteMany({});
		if (originalLoginRateLimits.length) {
			await loginRateLimits.insertMany(originalLoginRateLimits);
		}
		await client?.close();

		for (const filename of [legacyImage, draftImage]) {
			if (!filename) continue;
			await unlink(join(reviewImageDirectory, filename)).catch(() => undefined);
		}
	});

	test('keeps legacy reviews public without a migration', async ({ page }) => {
		const detailResponse = await page.goto(`/${legacySlug}`);
		expect(detailResponse?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: legacyTitle })).toBeVisible();
		await expect(page.getByText('Skapad', { exact: false })).toBeVisible();
		const mapLink = page.getByRole('link', { name: legacyAddress });
		await expect(mapLink).toHaveAttribute(
			'href',
			`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(legacyAddress)}`
		);
		await expect(mapLink).toHaveAttribute('target', '_blank');
		await expect(mapLink).toHaveAttribute('rel', 'noopener noreferrer');
		const fullDescription = page.getByTestId('review-description');
		await expect(fullDescription.getByRole('heading', { name: 'Helhetsintryck' })).toBeVisible();
		await expect(fullDescription.locator('strong')).toHaveText('minnesvärd');
		await expect(fullDescription.locator('em')).toHaveText('livlig');
		await expect(fullDescription.locator('ul > li')).toHaveCount(2);
		await expect(fullDescription.locator('ol > li')).toHaveCount(2);

		await page.goto('/');
		const card = page.locator(`a[href="/${legacySlug}"]`);
		const longPreview = card.getByTestId('review-description-preview');
		const shortPreview = page
			.locator(`a[href="/${shortSlug}"]`)
			.getByTestId('review-description-preview');
		await expect(longPreview.locator('strong')).toHaveText('minnesvärd');
		await expect(longPreview.locator('ul > li')).toHaveCount(2);
		await expect(shortPreview.locator('strong')).toHaveText('kort');

		const longPreviewSize = await longPreview.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
			overflow: window.getComputedStyle(element).overflow
		}));
		const shortPreviewSize = await shortPreview.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight
		}));

		expect(longPreviewSize).toMatchObject({ clientHeight: 80, overflow: 'hidden' });
		expect(shortPreviewSize).toMatchObject({ clientHeight: 80 });
		expect(longPreviewSize.scrollHeight).toBeGreaterThan(longPreviewSize.clientHeight);
		expect(shortPreviewSize.scrollHeight).toBeLessThanOrEqual(shortPreviewSize.clientHeight);

		const imageResponse = await page.request.get(`/images/${legacyImage}`);
		expect(imageResponse.status()).toBe(200);
		expect(imageResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
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
		await expect(marker).toBeVisible();
		const positioner = marker.locator('..');
		const priceLabel = positioner.locator('.bar-map-marker-price');
		await expect(priceLabel).toHaveText('65 kr');
		await expect(priceLabel).toHaveAttribute('title', 'Pris för en stor stark: 65 kr');
		await expect(marker).toHaveAttribute('title', `${legacyTitle} – Pris för en stor stark: 65 kr`);
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
		await marker.dispatchEvent('click');
		await expect(page.getByRole('heading', { name: legacyTitle })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Läs recension' })).toHaveAttribute(
			'href',
			`/${legacySlug}`
		);
		await expect
			.poll(() =>
				priceLabel.evaluate((element) => window.getComputedStyle(element).backgroundColor)
			)
			.not.toBe(initialPriceBackground);

		await page.getByRole('button', { name: 'Stäng förhandsvisning' }).click();
		await expect(page.getByRole('heading', { name: legacyTitle })).toHaveCount(0);
		await expect(marker).toBeFocused();
		await expect
			.poll(() =>
				priceLabel.evaluate((element) => window.getComputedStyle(element).backgroundColor)
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

	test('creates a private draft and publishes only the route review', async ({ browser }) => {
		test.setTimeout(60_000);

		const creatorContext = await browser.newContext();
		const creatorPage = await creatorContext.newPage();
		await login(creatorPage, 'test', 'testpass123');

		await creatorPage.goto('/admin/reviews/create');
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Adress').fill('Utkastgatan 1');
		await creatorPage.getByLabel('Pris för en stor stark').fill('1');
		await creatorPage.locator('#image').setInputFiles(fixtureImagePath);
		await creatorPage
			.getByLabel('Din recension')
			.fill('En fullständig recension som börjar privat.');
		await creatorPage.getByLabel('URL-slug').fill(draftSlug);
		for (const metric of [
			'atmosphere',
			'service',
			'selection',
			'quality',
			'price',
			'cleanliness',
			'soundLevel',
			'barhopPotential'
		]) {
			await setRange(creatorPage, metric, '4');
		}
		await setRange(creatorPage, 'rating', '2');
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Adress').fill('Utkastgatan 1');
		await expect(creatorPage.getByLabel('Barens namn')).toHaveValue(draftTitle);
		await expect(creatorPage.getByLabel('Adress')).toHaveValue('Utkastgatan 1');
		await creatorPage.getByRole('button', { name: 'Spara utkast' }).click();
		await creatorPage.waitForURL(`**/${draftSlug}`);

		await expect(creatorPage.getByText('Privat utkast')).toBeVisible();
		await expect(creatorPage.locator('[data-publication-status="draft"]').first()).toContainText(
			'Utkast'
		);

		const createdReview = await bars.findOne({ slug: draftSlug });
		expect(createdReview).toMatchObject({
			publicationStatus: 'draft',
			author: 'test'
		});
		draftImage = createdReview?.image as string;

		await creatorPage.goto('/');
		await expect(creatorPage.getByRole('heading', { name: draftTitle })).toBeVisible();
		await expect(
			creatorPage.locator(`a[href="/${draftSlug}"]`).locator('[data-publication-status="draft"]')
		).toBeVisible();

		const privateImageResponse = await creatorContext.request.get(`/images/${draftImage}`);
		expect(privateImageResponse.status()).toBe(200);
		expect(privateImageResponse.headers()['cache-control']).toBe('private, no-store');

		const anonymousContext = await browser.newContext();
		const anonymousPage = await anonymousContext.newPage();
		await anonymousPage.goto(`/?search=${encodeURIComponent(draftTitle)}`);
		await expect(anonymousPage.getByRole('heading', { name: draftTitle })).toHaveCount(0);
		await anonymousPage.goto('/statistik');
		await expect(
			anonymousPage.getByRole('heading', { name: 'Statistik för nästa barrunda.' })
		).toBeVisible();
		await expect(anonymousPage.getByRole('link', { name: draftTitle })).toHaveCount(0);
		await expectAnonymousNotFound(anonymousContext, `/${draftSlug}`);
		await expectAnonymousNotFound(anonymousContext, `/${draftSlug}/history`);
		await expectAnonymousNotFound(anonymousContext, `/images/${draftImage}`);

		await anonymousPage.goto(`/${draftSlug}/edit`);
		await expect(anonymousPage).toHaveURL(/\/login$/);

		const deniedPublish = await anonymousContext.request.post(`/${draftSlug}?/publish`, {
			headers: {
				origin: new URL(anonymousPage.url()).origin
			},
			form: {
				id: createdReview?._id.toString() ?? '',
				publicationStatus: 'published'
			}
		});
		expect(deniedPublish.status()).toBe(200);
		expect(await deniedPublish.json()).toMatchObject({
			type: 'failure',
			status: 401
		});
		expect((await bars.findOne({ slug: draftSlug }))?.publicationStatus).toBe('draft');

		const publisherContext = await browser.newContext();
		const publisherPage = await publisherContext.newPage();
		await login(publisherPage, publisherUsername, publisherPassword);
		await publisherPage.goto(`/${draftSlug}`);

		const decoy = await bars.findOne({ slug: decoySlug });
		await publisherPage.locator('form[action="?/publish"]').evaluate((form, decoyId) => {
			for (const [name, value] of [
				['id', decoyId],
				['publicationStatus', 'published']
			]) {
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = name;
				input.value = value;
				form.append(input);
			}
		}, decoy?._id.toString() ?? '');
		await publisherPage.getByRole('button', { name: 'Publicera recension' }).click();
		await publisherPage.waitForURL(`**/${draftSlug}`);

		const publishedReview = await bars.findOne({ slug: draftSlug });
		expect(publishedReview).toMatchObject({
			publicationStatus: 'published',
			author: publisherUsername,
			coAuthors: ['test']
		});
		expect(publishedReview?.changeLog?.at(-1)).toMatchObject({
			updatedBy: publisherUsername,
			changes: expect.arrayContaining([
				expect.objectContaining({
					field: 'publicationStatus',
					before: 'Utkast',
					after: 'Publicerad'
				})
			])
		});
		expect((await bars.findOne({ slug: decoySlug }))?.publicationStatus).toBe('draft');
		expect((await bars.findOne({ slug: legacySlug }))?.publicationStatus).toBeUndefined();
		expect(
			await auditLogs.countDocuments({
				eventType: 'review_publish',
				outcome: 'success',
				username: publisherUsername,
				targetSlug: draftSlug
			})
		).toBe(1);

		await expect(
			publisherPage.locator('[data-publication-status="published"]').first()
		).toContainText('Publicerad');

		await anonymousPage.goto(`/?search=${encodeURIComponent(draftTitle)}`);
		await expect(anonymousPage.getByRole('heading', { name: draftTitle })).toBeVisible();
		await anonymousPage.goto('/statistik');
		await expect(anonymousPage.getByRole('link', { name: draftTitle })).toBeVisible();
		expect((await anonymousContext.request.get(`/${draftSlug}`)).status()).toBe(200);
		expect((await anonymousContext.request.get(`/${draftSlug}/history`)).status()).toBe(200);
		const publicImageResponse = await anonymousContext.request.get(`/images/${draftImage}`);
		expect(publicImageResponse.status()).toBe(200);
		expect(publicImageResponse.headers()['cache-control']).toBe(
			'public, max-age=31536000, immutable'
		);

		await creatorContext.close();
		await publisherContext.close();
		await anonymousContext.close();
	});
});
