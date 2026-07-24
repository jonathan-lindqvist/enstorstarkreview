import { expect, test } from '@playwright/test';
import { MongoClient, ObjectId, type Collection } from 'mongodb';

const runId = `${Date.now()}-${process.pid}`;
const fixturePrefix = `Pagination ${runId}`;
const fixtureTitles = Array.from(
	{ length: 13 },
	(_, index) => `${fixturePrefix} bar ${String(index + 1).padStart(2, '0')}`
);
const fixtureSlugs = fixtureTitles.map((_, index) => `playwright-pagination-${runId}-${index + 1}`);
const draftTitle = `${fixturePrefix} dolt utkast`;
const draftSlug = `playwright-pagination-draft-${runId}`;

let client: MongoClient | undefined;
let bars: Collection;

const getSearchParameter = (url: string, parameter: string): string | null =>
	new URL(url).searchParams.get(parameter);

test.describe.serial('home page pagination', () => {
	test.beforeAll(async () => {
		const mongoUri = process.env.MONGO_URI;
		if (!mongoUri) throw new Error('MONGO_URI is required for home pagination integration tests');

		client = new MongoClient(mongoUri);
		await client.connect();
		bars = client.db('enstorstark').collection('bars');

		const now = Date.now();
		const reviewFields = {
			description: 'Recension för sidindelning.',
			atmosphere: 4,
			service: 4,
			selection: 4,
			quality: 4,
			price: 4,
			cleanliness: 4,
			soundLevel: 4,
			barhopPotential: 4,
			rating: 2,
			image: '',
			location: 'Testgatan 1, Stockholm',
			beerPriceKr: 65,
			isHappyHourPrice: false,
			author: 'test',
			coAuthors: [],
			changeLog: []
		};

		await bars.insertMany([
			...fixtureTitles.map((title, index) => ({
				_id: new ObjectId(),
				...reviewFields,
				title,
				slug: fixtureSlugs[index],
				publicationStatus: 'published',
				createdAt: new Date(now - index * 1000),
				updatedAt: new Date(now - index * 1000)
			})),
			{
				_id: new ObjectId(),
				...reviewFields,
				title: draftTitle,
				slug: draftSlug,
				publicationStatus: 'draft',
				createdAt: new Date(now + 1000),
				updatedAt: new Date(now + 1000)
			}
		]);
	});

	test.afterAll(async () => {
		await bars?.deleteMany({ slug: { $in: [...fixtureSlugs, draftSlug] } });
		await client?.close();
	});

	test('paginates complete search results and preserves the search in page links', async ({
		page
	}) => {
		await page.goto(`/?search=${encodeURIComponent(fixturePrefix)}`);

		await expect(page.getByText('Visar 1–12 av 13 recensioner.')).toBeVisible();
		await expect(page.getByRole('heading', { name: fixtureTitles[0] })).toBeVisible();
		await expect(page.getByRole('heading', { name: fixtureTitles[12] })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: draftTitle })).toHaveCount(0);

		await page.getByRole('link', { name: 'Nästa sida' }).click();
		await expect.poll(() => getSearchParameter(page.url(), 'page')).toBe('2');
		expect(getSearchParameter(page.url(), 'search')).toBe(fixturePrefix);
		await expect(page.getByText('Visar 13–13 av 13 recensioner.')).toBeVisible();
		await expect(page.getByRole('heading', { name: fixtureTitles[12] })).toBeVisible();
		await expect(page.getByRole('heading', { name: fixtureTitles[0] })).toHaveCount(0);
	});

	test('preserves sorting in page links and searches the complete result set from page two', async ({
		page
	}) => {
		await page.goto(`/?search=${encodeURIComponent(fixturePrefix)}&sort=oldest`);
		await page.getByRole('link', { name: 'Nästa sida' }).click();
		await expect.poll(() => getSearchParameter(page.url(), 'page')).toBe('2');
		expect(getSearchParameter(page.url(), 'search')).toBe(fixturePrefix);
		expect(getSearchParameter(page.url(), 'sort')).toBe('oldest');

		await page.goto(`/?search=${encodeURIComponent(fixturePrefix)}&page=2`);
		await page.getByLabel('Sök bland recensioner').fill(fixtureTitles[0]);
		await expect
			.poll(() => getSearchParameter(page.url(), 'search'), { timeout: 5_000 })
			.toBe(fixtureTitles[0]);
		expect(getSearchParameter(page.url(), 'page')).toBeNull();
		await expect(page.getByRole('heading', { name: fixtureTitles[0] })).toBeVisible();
		await expect(page.getByText('Visar 1–1 av 1 recension.')).toBeVisible();
	});
});
