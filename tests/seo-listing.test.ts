import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
	bars,
	legacySlug,
	apiPrivateSlug,
	mapGeocodes,
	runId,
	test,
	isolatedQuota,
	loginRateLimits,
	publisherUsername,
	publisherPassword,
	sessions
} from './fixtures/reviews';
import { installGeolocationMock, emitGeolocationPosition } from './fixtures/browser';
import { normalizeMapAddress } from '../src/lib/utils/map-address';

const search = `SEO-${runId}`;
const ids = Array.from({ length: 64 }, () => new ObjectId());
const title = (number: number) => `${search} ${String(number).padStart(3, '0')}`;
const slug = (number: number) => `seo-${runId}-${number}`;
const location = (number: number) => `Sökgatan ${number} ${runId}, Göteborg`;

test.beforeAll(async () => {
	const template = await bars.findOne({ slug: legacySlug });
	await bars.insertMany(
		ids.map((_id, number) => ({
			...template,
			_id,
			title: title(number),
			slug: slug(number),
			location: location(number),
			description:
				number === 0
					? '</script><script>window.seoInjected=true</script> & gott öl'
					: 'En recension med **öl**.',
			createdAt: new Date(Date.UTC(2027, 0, 1) + number * 1000),
			updatedAt: new Date('2026-01-01'),
			attributes: number % 2 ? ['quiz'] : ['darts'],
			publicationStatus:
				number === 60 ? 'draft' : number === 61 ? 'unknown' : number === 63 ? null : 'published',
			...(number === 62 ? { deletedAt: new Date() } : {}),
			changeLog: [{ updatedBy: 'private-history-sentinel', updatedAt: new Date(), changes: [] }]
		}))
	);
	await mapGeocodes.insertMany(
		ids.map((_, number) => ({
			addressKey: normalizeMapAddress(location(number)),
			address: location(number),
			status: 'resolved',
			latitude: 57.7 + number * 0.001,
			longitude: 12,
			updatedAt: new Date()
		}))
	);
});
test.afterAll(async () => {
	await bars.deleteMany({ _id: { $in: ids } });
	await mapGeocodes.deleteMany({
		addressKey: { $in: ids.map((_, number) => normalizeMapAddress(location(number))) }
	});
});
test.beforeEach(async ({ page }) => {
	await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ body: '' }));
});

test('server renders bounded, crawlable batches without JavaScript and omits unused history', async ({
	browser,
	request
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		const response = await page.goto(`/?search=${search}`);
		expect(response?.headers()['cache-control']).toBe('private, no-store');
		await expect(page.locator('main a h2')).toHaveCount(24);
		const discovered = await page
			.locator('main a:has(h2)')
			.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
		await expect(page.getByRole('navigation', { name: 'Recensionssidor' })).toBeVisible();
		await page.getByRole('link', { name: 'Fler recensioner', exact: true }).click();
		await expect(page).toHaveURL(/page=2/);
		await expect(page.locator('main a h2')).toHaveCount(24);
		discovered.push(
			...(await page
				.locator('main a:has(h2)')
				.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname)))
		);
		await page.getByRole('link', { name: 'Fler recensioner', exact: true }).click();
		await expect(page.locator('main a h2')).toHaveCount(12);
		discovered.push(
			...(await page
				.locator('main a:has(h2)')
				.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname)))
		);
		expect(new Set(discovered).size).toBe(60);
		for (let number = 0; number < 60; number++) expect(discovered).toContain(`/${slug(number)}`);
		await expect(page.getByRole('link', { name: 'Fler recensioner', exact: true })).toHaveCount(0);
		const html = await (await request.get(`/?search=${search}`)).text();
		expect(html).not.toContain('private-history-sentinel');
		expect((await request.get('/?page=10001')).status()).toBe(400);
		expect((await request.get('/?page=9999')).status()).toBe(404);
	} finally {
		await context.close();
	}
});

test('appends automatically and restores loaded reviews and scroll position on back navigation', async ({
	page
}) => {
	await page.goto(`/?search=${search}`);
	await expect(page.getByRole('navigation', { name: 'Recensionssidor' })).toHaveCount(0);
	await expect(page.locator('main a h2')).toHaveCount(24);
	await page.locator('main a h2').last().scrollIntoViewIfNeeded();
	await expect(page.locator('main a h2')).toHaveCount(48);
	await page.locator('main a h2').last().scrollIntoViewIfNeeded();
	await expect(page.locator('main a h2')).toHaveCount(60);
	const target = page.locator(`main a[href="/${slug(15)}"]`);
	await target.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => window.scrollY);
	await target.click();
	await expect(page).toHaveURL(new RegExp(`/${slug(15)}$`));
	await expect(page.getByRole('heading', { name: title(15), exact: true })).toBeVisible();
	await page.goBack();
	await expect(page.locator('main a h2')).toHaveCount(60);
	await expect(page.locator('#search')).toHaveValue(search);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 150);
});

test('search and filters cover reviews beyond the loaded batch and preserve direct links', async ({
	page
}) => {
	await page.goto(`/?search=${search}`);
	await page.locator('#search').fill(title(0));
	await expect(page.locator('main a h2')).toHaveText([title(0)]);
	await page.locator('#search').fill(search);
	await page.getByLabel('Sortera').selectOption('oldest');
	await expect(page.locator('main a h2').first()).toHaveText(title(0));
	await page.getByRole('button', { name: 'Filter', exact: true }).click();
	await page.getByRole('button', { name: 'Quiz', exact: true }).click();
	await expect(page.locator('main a h2').first()).toHaveText(title(1));
	await page.reload();
	await expect(page.locator('main a h2')).toHaveCount(24);
	await expect(page.locator('main a h2').first()).toHaveText(title(1));
	await page.locator('main a h2').last().scrollIntoViewIfNeeded();
	await expect(page.locator('main a h2')).toHaveCount(30);
});

test('nearest ordering includes the closest review outside the initial batch without transmitting visitor coordinates', async ({
	page
}) => {
	const requests: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('/recensioner/data')) requests.push(request.url());
	});
	await installGeolocationMock(page);
	await page.goto(`/?search=${search}&sort=nearest`);
	await expect(page.locator('main a h2').first()).toHaveText(title(59));
	await emitGeolocationPosition(page, 57.7, 12, 50);
	await expect(page.locator('main a h2').first()).toHaveText(title(0));
	await expect(page.locator('main a h2')).toHaveCount(24);
	expect(requests.some((url) => url.includes('view=index'))).toBe(true);
	expect(requests.every((url) => !/latitude|longitude|57\.7/.test(url))).toBe(true);
});

test('keeps cards readable on a failed append and offers a retry instead of pagination controls', async ({
	page
}) => {
	let failures = 1;
	await page.route('**/recensioner/data?**', (route) => {
		if (failures-- > 0) return route.fulfill({ status: 503, body: '{}' });
		return route.continue();
	});
	await page.goto(`/?search=${search}`);
	await page.locator('main a h2').last().scrollIntoViewIfNeeded();
	await expect(page.getByRole('alert')).toContainText('Kunde inte hämta');
	await expect(page.locator('main a h2')).toHaveCount(24);
	await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
	await expect(page.locator('main a h2')).toHaveCount(48);
});

test('publishes canonical metadata and safe structured data, with no private sitemap entries', async ({
	page,
	request
}) => {
	await page.goto('/?page=2');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://enstorstarkreview.se/?page=2'
	);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
	await page.goto(`/${slug(0)}`);
	await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
		'content',
		new RegExp(search)
	);
	const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
	expect(schema.map((text) => JSON.parse(text)).some((value) => value['@type'] === 'Review')).toBe(
		true
	);
	expect(await page.evaluate(() => 'seoInjected' in window)).toBe(false);
	await page.goto(`/?search=${search}`);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
	const xml = await (await request.get('/sitemap.xml')).text();
	expect(xml).toContain(`/${slug(0)}`);
	for (const number of [60, 61, 62, 63]) expect(xml).not.toContain(`/${slug(number)}<`);
	expect(xml).not.toContain(apiPrivateSlug);
	expect((await request.get('/robots.txt')).status()).toBe(200);
	const data = await request.get(`/recensioner/data?search=${search}`);
	expect(data.headers()['cache-control']).toBe('private, no-store');
	expect((await data.json()).bars).toHaveLength(24);
	expect((await request.get('/recensioner/data?ids=bad')).status()).toBe(400);
});

test('keeps draft batches session-protected and out of the sitemap for signed-in visitors', async ({
	request
}) => {
	const login = await isolatedQuota(loginRateLimits, () =>
		request.post('/api/v1/sessions', {
			headers: { 'content-type': 'application/json' },
			data: { username: publisherUsername, password: publisherPassword }
		})
	);
	expect(login.status()).toBe(201);
	const { token } = await login.json();
	try {
		const path = `/recensioner/data?ids=${ids[60].toHexString()}`;
		const deniedHeaders: Record<string, string>[] = [
			{},
			{ cookie: 'auth_session=invalid' },
			{ authorization: `Bearer ${token}` }
		];
		for (const headers of deniedHeaders) {
			expect((await (await request.get(path, { headers })).json()).bars).toEqual([]);
		}
		const headers = { cookie: `auth_session=${token}` };
		const draft = await request.get(path, { headers });
		expect(draft.headers()['cache-control']).toBe('private, no-store');
		const body = await draft.json();
		expect(body.bars[0]).toMatchObject({ slug: slug(60), publicationStatus: 'draft' });
		expect(body.bars[0]).not.toHaveProperty('changeLog');
		const xml = await (await request.get('/sitemap.xml', { headers })).text();
		for (const number of [60, 61, 62, 63]) expect(xml).not.toContain(`/${slug(number)}<`);
		const unknown = await (await request.get(`/${slug(63)}`, { headers })).text();
		expect(unknown).toContain('content="noindex, follow"');
		expect(unknown).not.toContain('"@type":"Review"');
	} finally {
		await sessions.deleteOne({ _id: token });
	}
});

test('keeps the first review identifiable without scrolling in both themes', async ({
	page,
	baseURL
}, testInfo) => {
	await page.context().addCookies([
		{ name: 'analytics_consent', value: 'denied', url: baseURL! },
		{ name: 'location_enabled', value: 'false', url: baseURL! }
	]);
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 844 });
		await page.goto(`/?search=${search}`);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await expect(page.locator('main a h2').first()).toHaveText(title(59));
			const firstReview = page.locator('main a:has(h2)').first();
			await expect(firstReview.getByRole('heading')).toBeInViewport({ ratio: 1 });
			await expect(firstReview.getByRole('img', { name: 'Helhetsbetyg 2 av 3' })).toBeInViewport({
				ratio: 1
			});
			await expect(firstReview.getByText('65 kr', { exact: true })).toBeInViewport({ ratio: 1 });
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
			await page.screenshot({
				path: testInfo.outputPath(`listing-${width}-${theme}.png`),
				animations: 'disabled'
			});
		}
	}
});

test('draws the sort control like the search field instead of the native menu button', async ({
	page
}) => {
	await page.goto('/');
	const sort = page.getByLabel('Sortera');
	const search = page.locator('#search');
	for (const theme of ['light', 'dark']) {
		await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
		// Compare settled field colours, rather than capturing an intermediate theme transition.
		await search.evaluate(async (input) => {
			await Promise.all(input.getAnimations().map((animation) => animation.finished));
		});
		// WebKit on macOS otherwise draws its own control, ignoring the field's height and padding.
		await expect(sort).toHaveCSS('appearance', 'none');
		await expect(sort).toHaveCSS('padding-right', '44px');
		for (const property of ['background-color', 'border-color', 'border-radius', 'color']) {
			const expected = await search.evaluate((input, name) => {
				return getComputedStyle(input).getPropertyValue(name);
			}, property);
			await expect(sort).toHaveCSS(property, expected);
		}
		await expect(page.locator('label', { has: sort }).locator('svg')).toBeVisible();
	}
});

test('explains first-hand reviews through the homepage method link', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Så recenserar vi', exact: true }).click();
	await expect(page).toHaveURL(/\/about#sa-recenserar-vi$/);
	const method = page.locator('#sa-recenserar-vi');
	await expect(method.getByRole('heading', { name: 'Hur recenserar ni?' })).toBeInViewport();
	await expect(method).toContainText('Vi besöker barer');
	await expect(method).toContainText('Foton');
	await expect(method).toContainText('Priser och utbud kan ha ändrats');
});
