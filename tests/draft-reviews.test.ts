import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from 'argon2';
import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';

const runId = `${Date.now()}-${process.pid}`;
const draftSlug = `playwright-utkast-${runId}`;
const legacySlug = `playwright-legacy-${runId}`;
const decoySlug = `playwright-annat-utkast-${runId}`;
const draftTitle = `Playwright-utkast ${runId}`;
const legacyTitle = `Playwright-legacy ${runId}`;
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
let databaseReady = false;
let draftImage: string | undefined;
let originalLoginRateLimits: Document[] = [];

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
				description: 'En äldre recension utan publicationStatus.',
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
				location: 'Legacygatan 1',
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
	});

	test.afterAll(async () => {
		if (!databaseReady) {
			await client?.close();
			return;
		}

		const createdReview = await bars.findOne({ slug: draftSlug }, { projection: { image: 1 } });
		draftImage = createdReview?.image as string | undefined;

		await bars.deleteMany({ slug: { $in: [draftSlug, legacySlug, decoySlug] } });
		await auditLogs.deleteMany({ targetSlug: { $in: [draftSlug, legacySlug, decoySlug] } });
		await auditLogs.deleteMany({ username: publisherUsername });
		await auditLogs.deleteMany({
			eventType: 'login_attempt',
			username: 'test',
			createdAt: { $gte: integrationStartedAt }
		});
		await users.deleteOne({ username: publisherUsername });
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

		const imageResponse = await page.request.get(`/images/${legacyImage}`);
		expect(imageResponse.status()).toBe(200);
		expect(imageResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
	});

	test('creates a private draft and publishes only the route review', async ({ browser }) => {
		test.setTimeout(60_000);

		const creatorContext = await browser.newContext();
		const creatorPage = await creatorContext.newPage();
		await login(creatorPage, 'test', 'testpass123');

		await creatorPage.goto('/admin/reviews/create');
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Adress').fill('Utkastgatan 1');
		await creatorPage.getByLabel('Pris för en stor stark').fill('64');
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
