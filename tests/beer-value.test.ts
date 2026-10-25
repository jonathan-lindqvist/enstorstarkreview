import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';
import { ObjectId } from 'mongodb';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
	bars,
	webDeleteVersionQuery,
	test,
	legacySlug,
	runId,
	isolatedQuota,
	loginRateLimits,
	publisherUsername,
	publisherPassword,
	sessions,
	fixtureImagePath,
	reviewImageDirectory,
	legacyImage
} from './fixtures/reviews';
import { login, nextWizardStep, rateEveryAspect } from './fixtures/browser';

const validator = new Ajv2020({ strict: false });
validator.addSchema(parse(readFileSync('openapi/v1.yaml', 'utf8')), 'contract');
const validateStatistics = validator.getSchema('contract#/components/schemas/ReviewStatistics')!;
const slugs: string[] = [];
let token = '';
let auth: { authorization: string };

const captureLayouts = async (page: Page, target: Locator, name: string, info: TestInfo) => {
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await target.screenshot({
				path: info.outputPath(`${name}-${width}-${theme}.png`),
				animations: 'disabled'
			});
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
	}
};

const insertReview = async (name: string, fields: Record<string, unknown> = {}) => {
	const source = await bars.findOne({ slug: legacySlug });
	if (!source) throw new Error('Missing review fixture');
	const slug = `volume-${runId}-${name}`;
	slugs.push(slug);
	await bars.insertOne({
		...source,
		_id: new ObjectId(),
		slug,
		title: `Volym ${name}`,
		beerBrand: 'Falcon Export',
		publicationStatus: 'published',
		...fields
	});
	return slug;
};

const editable = (slug: string, volumeCl?: number | null) => ({
	title: 'Volym via API',
	description: 'En recension med valfri serveringsvolym.',
	location: 'Volymgatan 1',
	slug,
	ratings: {
		atmosphere: 4,
		service: 4,
		selection: 4,
		quality: 4,
		price: 4,
		cleanliness: 4,
		soundLevel: 4,
		barhopPotential: 4
	},
	beer: {
		brand: 'Falcon Export',
		priceKr: 65,
		isHappyHourPrice: false,
		...(volumeCl !== undefined ? { volumeCl } : {})
	},
	authors: [publisherUsername],
	imageFocus: { x: 50, y: 50 }
});

test.beforeAll(async ({ request }) => {
	await isolatedQuota(loginRateLimits, async () => {
		const response = await request.post('/api/v1/sessions', {
			data: { username: publisherUsername, password: publisherPassword }
		});
		expect(response.status()).toBe(201);
		token = (await response.json()).token;
		auth = { authorization: `Bearer ${token}` };
	});
});

test.beforeEach(async ({ page, baseURL }) => {
	await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ body: '' }));
	await page.route(/https:\/\/[^/]*google-analytics\.com\//, (route) => route.abort());
	await page.context().addCookies([
		{ name: 'analytics_consent', value: 'denied', url: baseURL! },
		{ name: 'location_enabled', value: 'false', url: baseURL! }
	]);
});

test.afterAll(async ({ request, baseURL }) => {
	const uploads = await bars
		.find({ slug: { $in: slugs }, image: { $ne: legacyImage } }, { projection: { image: 1 } })
		.toArray();
	for (const slug of slugs)
		await request.post(
			`/${slug}?/delete${await webDeleteVersionQuery(request, slug, { cookie: `auth_session=${token}` })}`,
			{
				headers: { origin: baseURL!, accept: 'text/html', cookie: `auth_session=${token}` },
				form: {},
				maxRedirects: 0
			}
		);
	await bars.deleteMany({ slug: { $in: slugs } });
	for (const { image } of uploads) {
		await unlink(join(reviewImageDirectory, image)).catch(() => undefined);
		for (const preset of ['card-v1', 'detail-v1'])
			await unlink(join(reviewImageDirectory, 'previews', 'v1', `${image}.${preset}.webp`)).catch(
				() => undefined
			);
	}
	if (token) await sessions.deleteOne({ _id: token });
});

test('details show known volume and cl/kr without inventing legacy sizes or exposing drafts', async ({
	page,
	request
}, testInfo) => {
	await page.goto(`/${legacySlug}`);
	await expect(page.getByTestId('beer-value')).toHaveCount(0);
	const slug = await insertReview('detail', { beerVolumeCl: 50 });
	const draft = await insertReview('private', { beerVolumeCl: 200, publicationStatus: 'draft' });
	expect((await request.get(`/${draft}`)).status()).toBe(404);
	await page.goto(`/${slug}`);
	await expect(page.getByText('50 cl', { exact: true })).toBeVisible();
	await expect(page.getByTestId('beer-value')).toHaveText('0,77 cl/kr');
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await page.screenshot({
				path: testInfo.outputPath(`detail-${width}-${theme}.png`),
				animations: 'disabled',
				fullPage: true
			});
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
	}
});

test('web edits preserve clearing after errors and log size changes', async ({
	page
}, testInfo) => {
	const slug = await insertReview('form', { beerVolumeCl: 50 });
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${slug}/edit`);
	const size = page.getByLabel('Volym (cl)', { exact: true });
	await expect(size).toHaveValue('50');
	await captureLayouts(page, size.locator('..').locator('..'), 'form', testInfo);
	await size.fill('');
	await page.locator('#bar-name').fill('');
	await page
		.locator('form')
		.filter({ has: size })
		.evaluate((form) => {
			if (form instanceof HTMLFormElement) form.noValidate = true;
		});
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await expect(page.getByRole('alert')).toHaveText('Ogiltigt namn på baren');
	await expect(page.locator('#bar-name')).toBeFocused();
	await expect(size).toHaveValue('');
	await page.locator('#bar-name').fill('Volym efter ändring');
	await size.fill('40');
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await page.waitForURL(`**/${slug}`);
	await expect(page.getByTestId('beer-value')).toHaveText('0,62 cl/kr');
	expect((await bars.findOne({ slug }))?.changeLog.at(-1).changes).toContainEqual({
		field: 'beerVolumeCl',
		label: 'Volym för en stor stark',
		before: '50 cl',
		after: '40 cl'
	});
	await page.goto(`/${slug}/edit`);
	await size.fill('');
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await page.waitForURL(`**/${slug}`);
	await expect(page.getByTestId('beer-value')).toHaveCount(0);
	expect((await bars.findOne({ slug }))?.beerVolumeCl).toBeNull();
});

test('API edits preserve omitted size, clear null, reject invalid values, and guard stale writes', async ({
	request
}) => {
	const slug = await insertReview('api', { beerVolumeCl: 50 });
	const path = `/api/v1/reviews/${slug}`;
	let response = await request.get(path);
	expect((await response.json()).beer.volumeCl).toBe(50);
	let tag = response.headers().etag;
	expect(tag).toMatch(/^"v2-/);
	for (const volume of [undefined, 1, 200, null]) {
		response = await request.put(path, {
			headers: { ...auth, 'if-match': tag },
			data: editable(slug, volume)
		});
		expect(response.status()).toBe(200);
		expect((await response.json()).beer.volumeCl).toBe(volume === undefined ? 50 : volume);
		const previousTag = tag;
		tag = response.headers().etag;
		const stale = await request.put(path, {
			headers: { ...auth, 'if-match': previousTag },
			data: editable(slug, 33)
		});
		expect(stale.status()).toBe(412);
	}
	const snapshot = await bars.findOne({ slug });
	for (const volume of [0, -1, 201, 33.5, '50']) {
		const body = editable(slug);
		const rejected = await request.put(path, {
			headers: { ...auth, 'if-match': tag },
			data: { ...body, beer: { ...body.beer, volumeCl: volume } }
		});
		expect(rejected.status()).toBe(422);
		expect((await rejected.json()).code).toBe('validation_failed');
		expect(await bars.findOne({ slug })).toEqual(snapshot);
	}
	const anonymous = await request.put(path, {
		headers: { 'if-match': tag },
		data: editable(slug, 50)
	});
	expect(anonymous.status()).toBe(401);
	expect(await bars.findOne({ slug })).toEqual(snapshot);
});

test('actual Mongo statistics average individual ratios, exclude invalid/private data and refresh after edits', async ({
	request,
	page,
	baseURL
}, testInfo) => {
	const brand = `Volymöl ${runId}`;
	await insertReview('brand-a', { beerVolumeCl: 50, beerPriceKr: 50, beerBrand: brand, rating: 0 });
	const second = await insertReview('brand-b', {
		beerVolumeCl: 40,
		beerPriceKr: 80,
		beerBrand: ` ${brand} `,
		isHappyHourPrice: true
	});
	for (const [index, beerVolumeCl] of [
		undefined,
		null,
		'50',
		0,
		-1,
		201,
		33.5,
		NaN,
		Infinity
	].entries())
		await insertReview(`invalid-${index}`, { beerVolumeCl, beerBrand: brand });
	for (const [index, beerPriceKr] of ['65', 0, NaN, Infinity, 65.5, 1000].entries())
		await insertReview(`invalid-price-${index}`, {
			beerVolumeCl: 50,
			beerPriceKr,
			beerBrand: brand
		});
	await insertReview('private-brand', {
		beerVolumeCl: 200,
		beerPriceKr: 1,
		beerBrand: brand,
		publicationStatus: 'draft'
	});
	await insertReview('unknown-brand', {
		beerVolumeCl: 200,
		beerPriceKr: 1,
		beerBrand: brand,
		publicationStatus: 'unknown'
	});
	await insertReview('deleted-brand', {
		beerVolumeCl: 200,
		beerPriceKr: 1,
		beerBrand: brand,
		deletedAt: new Date()
	});
	for (let index = 0; index < 7; index++)
		await insertReview(`rank-${index}`, {
			title: index < 2 ? 'A tie' : `Rank ${index}`,
			beerVolumeCl: index < 2 ? 50 : 40 + index,
			beerPriceKr: 80,
			beerBrand: ''
		});
	await request.get('/api/v1/statistics');
	// Publish a draft to invalidate a previously populated public cache through the real workflow.
	const gate = await insertReview('publish', {
		publicationStatus: 'draft',
		beerVolumeCl: 100,
		beerPriceKr: 50,
		beerBrand: ''
	});
	expect(
		(await request.post(`/api/v1/reviews/${gate}/publication`, { headers: auth })).status()
	).toBe(200);
	const response = await request.get('/api/v1/statistics');
	expect(response.status()).toBe(200);
	const statistics = await response.json();
	expect(validateStatistics(statistics), JSON.stringify(validateStatistics.errors)).toBe(true);
	expect(
		statistics.beerBrandValues.find((entry: { brand: string }) => entry.brand === brand)
	).toEqual({ brand, averageClPerKr: 1, reviewCount: 1, happyHourReviewCount: 0 });
	const eligible = (
		await bars
			.find({
				deletedAt: { $exists: false },
				$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
			})
			.toArray()
	).filter(
		(bar) =>
			bar.isHappyHourPrice !== true &&
			Number.isInteger(bar.beerVolumeCl) &&
			bar.beerVolumeCl >= 1 &&
			bar.beerVolumeCl <= 200 &&
			Number.isInteger(bar.beerPriceKr) &&
			bar.beerPriceKr >= 1 &&
			bar.beerPriceKr <= 999
	);
	expect(statistics.valueReviewCount).toBe(eligible.length);
	expect(statistics.averageClPerKr).toBeCloseTo(
		eligible.reduce((sum, bar) => sum + bar.beerVolumeCl / bar.beerPriceKr, 0) / eligible.length,
		12
	);
	const publicReviews = await bars
		.find({
			deletedAt: { $exists: false },
			$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
		})
		.toArray();
	const priced = publicReviews.filter(
		(bar) => typeof bar.beerPriceKr === 'number' && bar.beerPriceKr >= 1 && bar.beerPriceKr <= 999
	);
	const regularPrices = priced.filter((bar) => bar.isHappyHourPrice !== true);
	expect(publicReviews.some((bar) => bar.rating === 0)).toBe(true);
	expect(statistics.totalReviews).toBe(publicReviews.length);
	expect(statistics.averageRating).toBeCloseTo(
		publicReviews.reduce((sum, bar) => sum + bar.rating, 0) / publicReviews.length,
		12
	);
	expect(statistics.priceReviewCount).toBe(regularPrices.length);
	expect(statistics.averageBeerPrice).toBeCloseTo(
		regularPrices.reduce((sum, bar) => sum + bar.beerPriceKr, 0) / regularPrices.length,
		12
	);
	expect(statistics.happyHourReviewCount).toBe(priced.length - regularPrices.length);
	expect(statistics.happyHourPercentage).toBeCloseTo(
		((priced.length - regularPrices.length) / priced.length) * 100,
		12
	);
	for (const [key, extreme] of [
		['cheapestBars', Math.min(...regularPrices.map((bar) => bar.beerPriceKr))],
		['mostExpensiveBars', Math.max(...regularPrices.map((bar) => bar.beerPriceKr))]
	] as const) {
		expect(statistics[key].map((bar: { slug: string }) => bar.slug).sort()).toEqual(
			regularPrices
				.filter((bar) => bar.beerPriceKr === extreme)
				.map((bar) => bar.slug)
				.sort()
		);
	}
	for (const [key, direction] of [
		['bestValueBars', -1],
		['worstValueBars', 1]
	] as const) {
		const expected = [...eligible]
			.sort(
				(a, b) =>
					direction * (a.beerVolumeCl / a.beerPriceKr - b.beerVolumeCl / b.beerPriceKr) ||
					a.title.localeCompare(b.title) ||
					a.slug.localeCompare(b.slug)
			)
			.slice(0, 5);
		expect(statistics[key].map((bar: { slug: string }) => bar.slug)).toEqual(
			expected.map((bar) => bar.slug)
		);
	}
	await page.goto('/statistik');
	const valueSection = page.getByRole('region', { name: 'Öl för pengarna', exact: true });
	await expect(valueSection.getByRole('table')).toHaveCount(0);
	const brandSection = page.getByRole('region', { name: 'Snittpris per ölmärke', exact: true });
	await expect(brandSection.getByRole('row', { name: new RegExp(brand) })).toContainText('1,00');
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await brandSection.screenshot({
				path: testInfo.outputPath(`statistics-${width}-${theme}.png`),
				animations: 'disabled'
			});
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
	}
	const current = await request.get(`/api/v1/reviews/${second}`);
	const update = editable(second, 80);
	update.beer = { ...update.beer, brand, priceKr: 80, isHappyHourPrice: false };
	expect(
		(
			await request.put(`/api/v1/reviews/${second}`, {
				headers: { ...auth, 'if-match': current.headers().etag },
				data: update
			})
		).status()
	).toBe(200);
	const refreshed = await (await request.get('/api/v1/statistics')).json();
	expect(
		refreshed.beerBrandValues.find((entry: { brand: string }) => entry.brand === brand)
			.averageClPerKr
	).toBe(1);
	expect(
		(
			await request.post(
				`/${second}?/delete${await webDeleteVersionQuery(request, second, { cookie: `auth_session=${token}` })}`,
				{
					headers: { origin: baseURL!, accept: 'text/html', cookie: `auth_session=${token}` },
					form: {},
					maxRedirects: 0
				}
			)
		).status()
	).toBe(303);
	const afterDelete = await (await request.get('/api/v1/statistics')).json();
	expect(afterDelete.valueReviewCount).toBe(refreshed.valueReviewCount - 1);
	expect(
		afterDelete.beerBrandValues.find((entry: { brand: string }) => entry.brand === brand)
			.reviewCount
	).toBe(1);
});

test('reviewer spending counts public credits, includes happy hour and refreshes after writes', async ({
	request,
	page,
	baseURL
}, testInfo) => {
	const initial = await (await request.get('/api/v1/statistics')).json();
	const baseline = initial.totalReviewerSpendKr;
	expect(baseline).toEqual(expect.any(Number));
	const formerPrimary = `spent-former-${runId}`;
	const formerCoAuthor = `spent-coauthor-${runId}`;
	await insertReview('spend-regular', {
		beerPriceKr: 60,
		author: formerPrimary,
		coAuthors: [
			formerPrimary,
			formerCoAuthor,
			'third-reviewer',
			formerCoAuthor,
			'',
			' \t',
			null,
			5,
			{},
			['nested']
		]
	});
	await insertReview('spend-happy-hour', {
		beerPriceKr: 40,
		isHappyHourPrice: true,
		author: formerPrimary,
		coAuthors: formerCoAuthor
	});
	const legacy = await insertReview('spend-legacy', { beerPriceKr: 50, author: formerPrimary });
	await bars.updateOne({ slug: legacy }, { $unset: { publicationStatus: 1, coAuthors: 1 } });
	await insertReview('spend-malformed-primary', {
		beerPriceKr: 10,
		author: { invalid: true },
		coAuthors: [formerCoAuthor, '', '  ', false, null]
	});
	await insertReview('spend-minimum', { beerPriceKr: 1, author: formerPrimary, coAuthors: [] });
	await insertReview('spend-maximum', { beerPriceKr: 999, author: formerPrimary, coAuthors: [] });
	const invalidPriceSlugs: string[] = [];
	for (const [index, beerPriceKr] of [
		undefined,
		null,
		'60',
		0,
		-1,
		1000,
		60.5,
		NaN,
		Infinity,
		-Infinity,
		[],
		[60],
		{},
		true
	].entries()) {
		invalidPriceSlugs.push(
			await insertReview(`spend-invalid-price-${index}`, {
				beerPriceKr,
				author: formerPrimary,
				coAuthors: [formerCoAuthor]
			})
		);
	}
	for (const [index, coAuthors] of [
		undefined,
		null,
		'',
		' ',
		[],
		{},
		5,
		[null, '', 42, {}]
	].entries()) {
		await insertReview(`spend-missing-credits-${index}`, {
			beerPriceKr: 60,
			author: null,
			coAuthors
		});
	}
	const missing = await insertReview('spend-missing-fields', { beerPriceKr: 60 });
	await bars.updateOne({ slug: missing }, { $unset: { author: 1, coAuthors: 1 } });
	for (const [index, fields] of [
		{ publicationStatus: 'draft' },
		{ publicationStatus: 'unknown' },
		{ deletedAt: new Date() }
	].entries()) {
		await insertReview(`spend-hidden-${index}`, {
			beerPriceKr: 999,
			author: formerPrimary,
			coAuthors: [formerCoAuthor],
			...fields
		});
	}
	const gate = await insertReview('spend-publish', {
		publicationStatus: 'draft',
		beerPriceKr: 1,
		author: publisherUsername,
		coAuthors: []
	});
	// The cache was populated before inserting fixtures; publication must refresh it.
	expect(
		(await request.post(`/api/v1/reviews/${gate}/publication`, { headers: auth })).status()
	).toBe(200);
	let expected = baseline + 1321;
	const expectSpending = async () => {
		const response = await request.get('/api/v1/statistics');
		expect(response.status()).toBe(200);
		const statistics = await response.json();
		expect(validateStatistics(statistics), JSON.stringify(validateStatistics.errors)).toBe(true);
		expect(statistics.totalReviewerSpendKr).toBe(expected);
		const signedIn = await (await request.get('/api/v1/statistics', { headers: auth })).json();
		expect(signedIn.totalReviewerSpendKr).toBe(expected);
	};
	await expectSpending();
	// Keep malformed price fixtures out of subsequent ranking/layout checks.
	await bars.deleteMany({ slug: { $in: invalidPriceSlugs } });
	await page.goto('/statistik');
	const overview = page.getByRole('region', { name: 'Överblick', exact: true });
	const spending = overview.getByTestId('total-reviewer-spend');
	await expect(overview.locator('dt > span:first-child')).toHaveText([
		'Recenserade barer',
		'I Göteborg',
		'Snittpris',
		'Totalt spenderat',
		'Stämplar',
		'Happy hour-fynd'
	]);
	await expect(spending).toHaveText(`${expected.toLocaleString('sv-SE')} kr`);
	await expect(
		overview.getByText('En öl per recensent och bar, inklusive happy hour.', { exact: true })
	).toBeVisible();
	await page.context().addCookies([{ name: 'auth_session', value: token, url: baseURL! }]);
	await page.reload();
	await expect(spending).toHaveText(`${expected.toLocaleString('sv-SE')} kr`);
	const updateGate = async (price: number, authors: string[]) => {
		const current = await request.get(`/api/v1/reviews/${gate}`);
		const body = editable(gate);
		body.beer.priceKr = price;
		body.authors = authors;
		expect(
			(
				await request.put(`/api/v1/reviews/${gate}`, {
					headers: { ...auth, 'if-match': current.headers().etag },
					data: body
				})
			).status()
		).toBe(200);
	};
	await updateGate(70, [publisherUsername, 'test']);
	expected += 139;
	await expectSpending();
	await updateGate(70, [publisherUsername]);
	expected -= 70;
	await expectSpending();
	const largeCredits = Array.from({ length: 1000 }, (_, index) => `spent-large-${index}-${runId}`);
	await insertReview('spend-large', {
		beerPriceKr: 999,
		author: largeCredits[0],
		coAuthors: largeCredits.slice(1)
	});
	await updateGate(71, [publisherUsername]);
	expected += 999001;
	await expectSpending();
	await page.reload();
	await expect(spending).toHaveText(`${expected.toLocaleString('sv-SE')} kr`);
	await expect(
		page.getByRole('region', { name: 'Billigast och dyrast', exact: true })
	).toBeVisible();
	await captureLayouts(page, overview, 'reviewer-spending', testInfo);
	expect(
		(
			await request.post(
				`/${gate}?/delete${await webDeleteVersionQuery(request, gate, { cookie: `auth_session=${token}` })}`,
				{
					headers: { origin: baseURL!, accept: 'text/html', cookie: `auth_session=${token}` },
					form: {},
					maxRedirects: 0
				}
			)
		).status()
	).toBe(303);
	expected -= 71;
	await expectSpending();
});

test('wizard accepts and saves an optional serving size', async ({ page }, testInfo) => {
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto('/admin/reviews/create/wizard');
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill(`Volymwizard ${runId}`);
	slugs.push(`volymwizard-${runId}`);
	await page.getByLabel('Adress', { exact: true }).fill('Volymgatan 1');
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByLabel('Volym (cl)', { exact: true }).fill('50');
	await page.getByRole('radio', { name: 'Falcon Export', exact: true }).check();
	await captureLayouts(
		page,
		page.getByRole('heading', { name: 'Stor stark', exact: true }).locator('..').locator('..'),
		'wizard',
		testInfo
	);
	await nextWizardStep(page);
	await rateEveryAspect(page, 3);
	await page.locator('#description').fill('En stor öl i ett känt glas.');
	await nextWizardStep(page);
	await page.getByRole('button', { name: 'Spara utkast', exact: true }).click();
	await page.waitForURL(/\/volymwizard-/);
	const saved = await bars.findOne({ title: `Volymwizard ${runId}` });
	expect(saved?.beerVolumeCl).toBe(50);
	if (saved) slugs.push(saved.slug);
});
