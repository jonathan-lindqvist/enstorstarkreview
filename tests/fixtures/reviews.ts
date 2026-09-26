import { test as base } from '@playwright/test';
import { hash } from 'argon2';
import { MongoClient, ObjectId, type Collection, type Db, type Document } from 'mongodb';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const runId = `${Date.now()}-${process.pid}`;
export const draftSlug = `playwright-utkast-${runId}`;
export const legacySlug = `playwright-legacy-${runId}`;
export const shortSlug = `playwright-kort-${runId}`;
export const decoySlug = `playwright-annat-utkast-${runId}`;
export const authorshipSlug = `playwright-authors-${runId}`;
export const apiSlug = `playwright-api-${runId}`;
export const formerPrimary = `former-z-${runId}`;
export const formerCoAuthor = `former-a-${runId}`;
export const draftTitle = `Playwright-utkast ${runId}`;
export const legacyTitle = `Playwright-legacy ${runId}`;
export const shortTitle = `Playwright-kort ${runId}`;
export const legacyAddress = `Legacygatan ${runId}`;
export const shortAddress = `Kortgatan ${runId}`;
export const listedBeerBrand = 'Melleruds Utmärkta Pilsner';
export const customBeerBrand = `Husets lager ${runId}`;
export const legacyMarkdownDescription = `## Helhetsintryck

En **minnesvärd** och *livlig* bar med ett väldigt långt omdöme som fortsätter för att kortet ska behöva klippa innehållet visuellt.

- Första detaljen som är värd att komma ihåg
- Andra detaljen som också är värd att komma ihåg

1. Börja med en stor stark
2. Stanna kvar för stämningen`;
export const publisherUsername = `publisher-${process.pid}`;
export const publisherPassword = 'publisher-test-password';
export const fixtureImagePath = join(process.cwd(), 'src', 'lib', 'images', 'image.png');
export const reviewImageDirectory =
	process.env.REVIEW_IMAGE_DIR ??
	(process.env.PLAYWRIGHT_TEST_BASE_URL
		? join(process.cwd(), 'uploads', 'images')
		: join(tmpdir(), 'enstorstarkreview-playwright-images'));
export const legacyImage = `${new ObjectId().toHexString()}.png`;
export const integrationStartedAt = new Date();

let client: MongoClient | undefined;
let database: Db;
export let bars: Collection;
export let auditLogs: Collection;
let users: Collection;
let loginRateLimits: Collection;
let mapGeocodes: Collection;
let databaseReady = false;
let draftImage: string | undefined;
let authorshipImage: string | undefined;
let apiImage: string | undefined;
let originalLoginRateLimits: Document[] = [];

const setupReviews = async () => {
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
			attributes: ['quiz', 'sportsTv'],
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
			attributes: ['boardGames', 'darts'],
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
			imageFocusX: 25,
			imageFocusY: 75,
			location: shortAddress,
			slug: shortSlug,
			beerBrand: listedBeerBrand,
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
			attributes: ['karaoke'],
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
	await mapGeocodes.insertMany([
		{
			addressKey: legacyAddress.toLocaleLowerCase('sv-SE'),
			address: legacyAddress,
			status: 'resolved',
			latitude: 57.72,
			longitude: 12.03,
			updatedAt: now
		},
		{
			addressKey: shortAddress.toLocaleLowerCase('sv-SE'),
			address: shortAddress,
			status: 'resolved',
			latitude: 57.72,
			longitude: 12.03,
			updatedAt: now
		}
	]);
};
const cleanupReviews = async () => {
	if (!databaseReady) {
		await client?.close();
		return;
	}

	const createdReview = await bars.findOne({ slug: draftSlug }, { projection: { image: 1 } });
	draftImage = createdReview?.image as string | undefined;
	authorshipImage = (await bars.findOne({ slug: authorshipSlug }))?.image as string | undefined;
	apiImage = (await bars.findOne({ slug: apiSlug }))?.image as string | undefined;

	await bars.deleteMany({
		slug: { $in: [draftSlug, legacySlug, shortSlug, decoySlug, authorshipSlug, apiSlug] }
	});
	await auditLogs.deleteMany({
		targetSlug: {
			$in: [draftSlug, legacySlug, shortSlug, decoySlug, authorshipSlug, apiSlug]
		}
	});
	await auditLogs.deleteMany({ username: publisherUsername });
	await auditLogs.deleteMany({
		eventType: 'login_attempt',
		username: 'test',
		createdAt: { $gte: integrationStartedAt }
	});
	await users.deleteOne({ username: publisherUsername });
	await mapGeocodes.deleteMany({
		addressKey: {
			$in: [legacyAddress.toLocaleLowerCase('sv-SE'), shortAddress.toLocaleLowerCase('sv-SE')]
		}
	});
	await loginRateLimits.deleteMany({});
	if (originalLoginRateLimits.length) {
		await loginRateLimits.insertMany(originalLoginRateLimits);
	}
	await client?.close();

	for (const filename of [legacyImage, draftImage, authorshipImage, apiImage]) {
		if (!filename) continue;
		await unlink(join(reviewImageDirectory, filename)).catch(() => undefined);
	}
};

// All database-backed feature specs share this lifetime and run with one worker.
export const test = base.extend<Record<never, never>, { reviewDatabase: void }>({
	reviewDatabase: [
		// Playwright requires a destructured fixture argument even without dependencies.
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			try {
				await setupReviews();
				await use();
			} finally {
				await cleanupReviews();
			}
		},
		{ scope: 'worker', auto: true }
	]
});
