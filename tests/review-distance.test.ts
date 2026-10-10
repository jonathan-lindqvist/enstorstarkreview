import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
	emitGeolocationError,
	emitGeolocationPosition,
	installGeolocationMock,
	login,
	readGeolocationState,
	readGeolocationWatchCount
} from './fixtures/browser';
import {
	bars,
	isolatedQuota,
	legacySlug,
	loginRateLimits,
	mapGeocodes,
	runId,
	test
} from './fixtures/reviews';

const search = `Avståndstest ${process.pid}`;
const nearSlug = `distance-near-${runId}`;
const farSlug = `distance-far-${runId}`;
const unknownSlug = `distance-unknown-${runId}`;
const privateSlug = `distance-private-${runId}`;
const invalidStatusSlug = `distance-invalid-status-${runId}`;
const slugs = [nearSlug, farSlug, unknownSlug, privateSlug, invalidStatusSlug];
const address = (index: number) => `Avståndsgatan ${index}-${process.pid}`;

test.beforeAll(async () => {
	const source = await bars.findOne({ slug: legacySlug });
	await bars.insertMany(
		slugs.map((slug, index) => ({
			...source,
			_id: new ObjectId(),
			slug,
			title: `${search} ${index}`,
			location: address(index),
			attributes: index === 0 ? ['quiz'] : ['darts'],
			publicationStatus: index === 3 ? 'draft' : index === 4 ? 'invalid' : 'published',
			createdAt: new Date(`2026-01-0${index + 1}T12:00:00Z`)
		}))
	);
	await mapGeocodes.insertMany(
		[0, 1, 3, 4].map((index) => ({
			addressKey: address(index).toLocaleLowerCase('sv-SE'),
			address: address(index),
			status: 'resolved',
			latitude: index === 3 ? 58.123456 : index === 4 ? 58.654321 : 57.7089 + index * 0.02,
			longitude: 11.9746,
			updatedAt: new Date()
		}))
	);
});

test.afterAll(async () => {
	await bars.deleteMany({ slug: { $in: slugs } });
	await mapGeocodes.deleteMany({
		addressKey: { $in: slugs.map((_, index) => address(index).toLocaleLowerCase('sv-SE')) }
	});
});

test('offers optional nearest sorting and shows local distance without changing the default', async ({
	page
}) => {
	await installGeolocationMock(page);
	await page.goto(`/?search=${runId}`);
	const sort = page.getByLabel('Sortera');
	await expect(sort).toHaveValue('latest');
	await expect(sort.getByRole('option', { name: 'Närmast', exact: true })).toBeAttached();
	await expect
		.poll(async () => (await readGeolocationState(page)).watchOptions)
		.toEqual({
			enableHighAccuracy: false,
			maximumAge: 15_000,
			timeout: 10_000
		});
	await emitGeolocationPosition(page, 57.71, 12.03, 80);
	const card = page.locator(`a[href="/${legacySlug}"]`);
	await expect(card.getByText('1,1 km', { exact: true })).toBeVisible();
	await expect(card.locator('[data-testid="review-distance"] svg')).toBeVisible();
	await expect(sort).toHaveValue('latest');
	await sort.selectOption('nearest');
	await expect(page).toHaveURL(/sort=nearest/);
});

test('sorts nearest first with unknown bars last and preserves search, filters and direct links', async ({
	page
}) => {
	await installGeolocationMock(page);
	await page.goto(`/?search=${encodeURIComponent(search)}&sort=nearest`);
	const headings = page.locator('a h2').filter({ hasText: search });
	await expect(page.getByLabel('Sortera')).toHaveValue('nearest');
	await expect(headings).toHaveText([`${search} 2`, `${search} 1`, `${search} 0`]);
	await expect(page.getByRole('status')).toContainText('Visar senaste recensionerna');
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 57.7089, 11.9746, 80);
	await expect(headings).toHaveText([`${search} 0`, `${search} 1`, `${search} 2`]);
	const nearCard = page.locator(`a[href="/${nearSlug}"]`);
	const farCard = page.locator(`a[href="/${farSlug}"]`);
	await expect(nearCard.getByText('0,0 km', { exact: true })).toBeVisible();
	await expect(farCard.getByText('2,2 km', { exact: true })).toBeVisible();
	await expect(
		page.locator(`a[href="/${unknownSlug}"] [data-testid="review-distance"]`)
	).toHaveCount(0);
	const retainedCard = await nearCard.elementHandle();
	await emitGeolocationPosition(page, 57.7289, 11.9746, 80);
	await expect(headings).toHaveText([`${search} 1`, `${search} 0`, `${search} 2`]);
	expect(await retainedCard?.evaluate((element) => element.isConnected)).toBe(true);
	await page.getByRole('button', { name: 'Filter', exact: true }).click();
	await page.getByRole('button', { name: 'Quiz', exact: true }).click();
	await expect(headings).toHaveText([`${search} 0`]);
	await expect(page).toHaveURL(/sort=nearest/);
	expect(new URL(page.url()).searchParams.getAll('attributes')).toEqual(['quiz']);
	await page.reload();
	await expect(page.getByLabel('Sortera')).toHaveValue('nearest');
	await expect(headings).toHaveText([`${search} 0`]);
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 57.7089, 11.9746, 80);
	await expect(nearCard.getByText('0,0 km', { exact: true })).toBeVisible();
});

test('shows the same card and detail distance, restarts tracking on navigation, and disposes it', async ({
	page
}) => {
	await installGeolocationMock(page);
	await page.goto(`/?search=${runId}`);
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 57.71, 12.03, 80);
	await expect(
		page.locator(`a[href="/${legacySlug}"]`).getByText('1,1 km', { exact: true })
	).toBeVisible();
	await page.locator(`a[href="/${legacySlug}"]`).click();
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(2);
	await emitGeolocationPosition(page, 57.71, 12.03, 80);
	await expect(page.getByTestId('review-distance')).toHaveText('1,1 km');
	await expect(page.getByTestId('review-distance')).toHaveAttribute('aria-label', /fågelvägen/);
	await page.getByRole('link', { name: 'FAQ', exact: true }).click();
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toEqual([73, 73]);
	await emitGeolocationPosition(page, 57.72, 12.03, 80);
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
	await expect(
		page.getByRole('heading', { name: 'Hur fungerar avstånd och platsåtkomst?' })
	).toBeVisible();
});

test('requests location on direct detail visits and recovers from failures', async ({ page }) => {
	await installGeolocationMock(page);
	await page.goto(`/${legacySlug}`);
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
	await emitGeolocationError(page, 3);
	await expect(page.getByText('Din position kunde inte hämtas just nu.')).toBeVisible();
	await emitGeolocationPosition(page, 57.71, 12.03, 80);
	await expect(page.getByTestId('review-distance')).toHaveText('1,1 km');
	await emitGeolocationError(page, 1);
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
	await expect(page.getByText(/Platsåtkomst nekades/)).toBeVisible();
});

test('falls back on permission denial and activates the retained nearest sort on recovery', async ({
	page
}) => {
	await installGeolocationMock(page);
	await page.goto(`/?search=${encodeURIComponent(search)}&sort=nearest`);
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 57.7089, 11.9746, 80);
	await expect(page.locator('a h2').filter({ hasText: search })).toHaveText([
		`${search} 0`,
		`${search} 1`,
		`${search} 2`
	]);
	await emitGeolocationError(page, 1);
	await expect(page.getByRole('status')).toContainText('Platsåtkomst nekades');
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
	await expect(page.locator('a h2').filter({ hasText: search })).toHaveText([
		`${search} 2`,
		`${search} 1`,
		`${search} 0`
	]);
	await expect(page.getByLabel('Sortera')).toHaveValue('nearest');
	await emitGeolocationPosition(page, 57.7089, 11.9746, 80);
	await expect(page.locator('a h2').filter({ hasText: search })).toHaveText([
		`${search} 0`,
		`${search} 1`,
		`${search} 2`
	]);
});

test('keeps user coordinates out of requests and storage and never exposes private bar coordinates', async ({
	page
}) => {
	await installGeolocationMock(page);
	const requests: string[] = [];
	page.on('request', (request) => requests.push(`${request.url()} ${request.postData() ?? ''}`));
	const response = await page.goto(`/?search=${encodeURIComponent(search)}&sort=nearest`);
	const html = await response!.text();
	expect(html).not.toContain('58.123456');
	expect(html).not.toContain('58.654321');
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 57.713456, 11.981234, 80);
	await expect(page.getByTestId('review-distance')).toHaveCount(2);
	await page.locator(`a[href="/${nearSlug}"]`).click();
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(2);
	await emitGeolocationPosition(page, 57.713456, 11.981234, 80);
	await expect(page.getByTestId('review-distance')).toBeVisible();
	for (const coordinate of ['57.713456', '11.981234']) {
		expect(requests.join('\n')).not.toContain(coordinate);
		expect(JSON.stringify(await page.context().cookies())).not.toContain(coordinate);
		expect(
			await page.evaluate(() =>
				JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])
			)
		).not.toContain(coordinate);
	}
	expect(requests.filter((request) => /nominatim|next-marker/.test(request))).toEqual([]);
	expect((await page.request.get(`/${privateSlug}`)).status()).toBe(404);
	expect((await page.request.get(`/${invalidStatusSlug}`)).status()).toBe(404);
});

test('shows saved draft distances only after authentication', async ({ page }) => {
	await installGeolocationMock(page);
	await isolatedQuota(loginRateLimits, () => login(page, 'test', 'testpass123'));
	await page.goto(`/${privateSlug}`);
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
	await emitGeolocationPosition(page, 58.123456, 11.9746, 80);
	await expect(page.getByTestId('review-distance')).toHaveText('0,0 km');
	await expect(page.getByText('Privat utkast', { exact: true })).toBeVisible();
});

test('supports browser-granted location and gracefully handles unsupported geolocation', async ({
	page
}) => {
	await page.context().grantPermissions(['geolocation']);
	await page.context().setGeolocation({ latitude: 57.71, longitude: 12.03, accuracy: 80 });
	await page.goto(`/${legacySlug}`);
	await expect(page.getByTestId('review-distance')).toHaveText('1,1 km');
	await page.addInitScript(() =>
		Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
	);
	await page.goto(`/?search=${encodeURIComponent(search)}&sort=nearest`);
	await expect(page.getByRole('status')).toContainText('Din position kunde inte hämtas just nu.');
	await expect(page.locator('a h2').filter({ hasText: search })).toHaveText([
		`${search} 2`,
		`${search} 1`,
		`${search} 0`
	]);
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
});
