import { expect } from '@playwright/test';
import type { PublicReviewMapData } from '../src/lib/types/review-map';
import {
	distanceFromMapCenter,
	emitGeolocationPosition,
	finishWizardStep,
	installGeolocationMock,
	login,
	openWizardStep
} from './fixtures/browser';
import {
	bars,
	decoySlug,
	legacySlug,
	legacyTitle,
	legacyAddress,
	shortAddress,
	runId,
	shortSlug,
	shortTitle,
	test
} from './fixtures/reviews';

test('combines OR attribute filters with search, sorting and reloadable direct links', async ({
	page,
	browser
}) => {
	await page.goto(`/?search=${runId}&sort=score&attributes=quiz&attributes=unknown`);
	const legacyCard = page.locator(`a[href="/${legacySlug}"]`);
	const shortCard = page.locator(`a[href="/${shortSlug}"]`);
	const filters = page.getByRole('group', { name: 'Filtrera på aktiviteter och utbud' });
	const filterButton = page.getByRole('button', { name: 'Filter', exact: true });
	await expect(filterButton).toHaveAttribute('aria-expanded', 'false');
	await expect(filters).toBeHidden();
	await expect(filterButton.locator('svg')).toBeVisible();
	await filterButton.focus();
	await page.keyboard.press('Enter');
	await expect(filterButton).toHaveAttribute('aria-expanded', 'true');
	await expect(filters).toBeVisible();
	await expect(legacyCard).toBeVisible();
	await expect(shortCard).toHaveCount(0);
	await expect(legacyCard.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
		'QuizSport-TV'
	);
	await expect(filters.getByRole('button', { name: 'Quiz', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const retainedCard = await legacyCard.elementHandle();
	await filters.getByRole('button', { name: 'Dart', exact: true }).click();
	await expect(legacyCard).toBeVisible();
	await expect(shortCard).toBeVisible();
	expect(
		await retainedCard?.evaluate(
			(element, slug) => element.isConnected && element.getAttribute('href') === `/${slug}`,
			legacySlug
		)
	).toBe(true);
	await page.keyboard.press('Escape');
	await expect(filters).toBeHidden();
	await expect(filterButton).toBeFocused();
	await expect(filterButton.getByText('2', { exact: true })).toBeVisible();
	await filterButton.click();
	await expect(shortCard.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
		'BrädspelDart'
	);
	await expect(page.locator(`a[href="/${decoySlug}"]`)).toHaveCount(0);
	await expect(page.locator('select')).toHaveValue('score');
	expect(new URL(page.url()).searchParams.getAll('attributes')).toEqual(['quiz', 'darts']);
	await page.reload();
	await expect(legacyCard).toBeVisible();
	await expect(shortCard).toBeVisible();
	await expect(filterButton).toHaveAttribute('aria-expanded', 'false');
	await expect(filterButton.getByText('2', { exact: true })).toBeVisible();
	await filterButton.click();
	await page.locator('#search').fill(shortTitle);
	await expect(legacyCard).toHaveCount(0);
	await expect(shortCard).toBeVisible();
	await page.locator('select').selectOption('oldest');
	await expect(page).toHaveURL(/sort=oldest/);
	await page.locator('#search').fill('No matching bar');
	await expect(page.getByRole('status')).toHaveText('Inga barer matchar dina filter.');
	await filters.getByRole('button', { name: 'Rensa filter' }).click();
	await page.locator('#search').fill('');
	await expect(legacyCard).toBeVisible();
	await expect(shortCard).toBeVisible();
	await expect(filters.getByRole('button', { name: 'Rensa filter' })).toHaveCount(0);
	expect(new URL(page.url()).searchParams.has('attributes')).toBe(false);
	await page.goto(`/${legacySlug}`);
	await expect(page.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
		'QuizSport-TV'
	);

	// Verify first rendering as well as the hydrated client, without inspecting serialized page data.
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const serverPage = await context.newPage();
		await serverPage.goto(`/?search=${runId}&attributes=darts`);
		await expect(serverPage.getByRole('heading', { name: shortTitle })).toBeVisible();
		await expect(serverPage.getByRole('heading', { name: legacyTitle })).toHaveCount(0);
		await expect(serverPage.locator('#search')).toHaveValue(runId);
	} finally {
		await context.close();
	}
});

test('filters existing map markers and closes a hidden preview without moving the camera', async ({
	page
}) => {
	await installGeolocationMock(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/karta?attributes=quiz');
	const legacyMarker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
	const shortMarker = page.getByRole('button', { name: `Visa ${shortTitle} på kartan` });
	const filters = page.getByRole('group', { name: 'Filtrera på aktiviteter och utbud' });
	const filterButton = page.getByRole('button', { name: 'Filter', exact: true });
	await expect(filters).toBeHidden();
	await filterButton.click();
	await expect(filters).toBeVisible();
	const filterRequests: string[] = [];
	page.on('request', (request) => {
		if (/\/karta\/(?:next-marker|__data\.json)/.test(request.url()))
			filterRequests.push(request.url());
	});
	await expect(legacyMarker).toBeVisible();
	await expect(shortMarker).toHaveCount(0);
	await emitGeolocationPosition(page, 57.72, 12.03, 20);
	await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
	await legacyMarker.click();
	const preview = page.getByRole('region', { name: `Information om ${legacyTitle}` });
	await expect(preview.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
		'QuizSport-TV'
	);
	await filters.getByRole('button', { name: 'Dart', exact: true }).click();
	await expect(shortMarker).toBeVisible();
	await filters.getByRole('button', { name: 'Quiz', exact: true }).click();
	await expect(legacyMarker).toHaveCount(0);
	await expect(preview).toHaveCount(0);
	await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
	await shortMarker.click();
	await expect(
		page
			.getByRole('region', { name: `Information om ${shortTitle}` })
			.getByRole('list', { name: 'Aktiviteter och utbud' })
	).toHaveText('BrädspelDart');
	await filters.getByRole('button', { name: 'Rensa filter' }).click();
	await expect(legacyMarker).toBeVisible();
	await expect(shortMarker).toBeVisible();
	await filters.getByRole('button', { name: 'Karaoke', exact: true }).click();
	await expect(legacyMarker).toHaveCount(0);
	await expect(shortMarker).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: `Visa Annat utkast ${runId} på kartan` })
	).toHaveCount(0);
	expect(filterRequests).toEqual([]);
	await page.reload();
	await expect(filterButton).toHaveAttribute('aria-expanded', 'false');
	await expect(filters).toBeHidden();
	await filterButton.click();
	await expect(filters.getByRole('button', { name: 'Karaoke', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await filters.getByRole('button', { name: 'Rensa filter' }).click();
	await expect(legacyMarker).toBeVisible();
	await expect(shortMarker).toBeVisible();
});

test('refreshes retained markers and shows empty filter results for controlled map data', async ({
	page
}) => {
	await installGeolocationMock(page);
	await login(page, 'test', 'testpass123');
	const updatedTitle = `${legacyTitle} uppdaterad`;
	const map: PublicReviewMapData = {
		totalReviews: 2,
		markers: [
			{
				slug: legacySlug,
				title: updatedTitle,
				location: legacyAddress,
				rating: 3,
				latitude: 57.72,
				longitude: 12.03,
				beerPriceKr: 80,
				isHappyHourPrice: true,
				attributes: ['quiz', 'shuffleboard']
			},
			{
				slug: shortSlug,
				title: shortTitle,
				location: shortAddress,
				rating: 2,
				latitude: 57.72,
				longitude: 12.03,
				attributes: ['darts']
			}
		]
	};
	let releaseResponse = () => {};
	const responseGate = new Promise<void>((resolve) => {
		releaseResponse = resolve;
	});
	await page.route('**/karta/next-marker', async (route) => {
		await responseGate;
		await route.fulfill({ json: { map } });
	});
	try {
		await page.goto('/karta');
		const originalMarker = page.getByRole('button', { name: `Visa ${legacyTitle} på kartan` });
		const shortMarker = page.getByRole('button', { name: `Visa ${shortTitle} på kartan` });
		await expect(originalMarker).toBeVisible();
		await expect(shortMarker.locator('..').locator('.bar-map-marker-price')).toHaveText('65 kr');
		await emitGeolocationPosition(page, 57.72, 12.03, 20);
		await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
		const retainedMarker = await originalMarker.elementHandle();
		await originalMarker.click();
		await expect(page.getByRole('region', { name: `Information om ${legacyTitle}` })).toBeVisible();
		const response = page.waitForResponse('**/karta/next-marker');
		releaseResponse();
		await response;

		const updatedMarker = page.getByRole('button', { name: `Visa ${updatedTitle} på kartan` });
		await expect(updatedMarker).toBeVisible();
		expect(
			await retainedMarker?.evaluate(
				(element, title) =>
					element.isConnected && element.getAttribute('aria-label') === `Visa ${title} på kartan`,
				updatedTitle
			)
		).toBe(true);
		const priceLabel = updatedMarker.locator('..').locator('.bar-map-marker-price');
		await expect(priceLabel).toHaveText('80 kr*');
		await expect(priceLabel).toHaveAttribute(
			'title',
			'Pris för en stor stark: 80 kr* (* happy hour)'
		);
		await expect(updatedMarker).toHaveAttribute(
			'title',
			`${updatedTitle} – Pris för en stor stark: 80 kr* (* happy hour)`
		);
		await expect(updatedMarker).toHaveAccessibleDescription(
			'Pris för en stor stark: 80 kr*. Happy hour-pris.'
		);
		await expect(shortMarker.locator('..').locator('.bar-map-marker-price')).toHaveCount(0);
		await expect(shortMarker.locator('..').locator('.bar-map-marker-description')).toHaveCount(0);
		expect(await shortMarker.getAttribute('aria-describedby')).toBeNull();
		await expect(shortMarker).toHaveAttribute('title', shortTitle);
		const preview = page.getByRole('region', { name: `Information om ${updatedTitle}` });
		await expect(preview.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
			'QuizShuffleboard'
		);
		await expect(preview).toContainText('Helhetsbetyg: 3/3');
		await expect(updatedMarker).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Stäng förhandsvisning' }).click();
		await updatedMarker.click();
		await expect(preview).toBeVisible();
		await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);

		await page.getByRole('button', { name: 'Filter', exact: true }).click();
		const filters = page.getByRole('group', { name: 'Filtrera på aktiviteter och utbud' });
		await filters.getByRole('button', { name: 'Karaoke', exact: true }).click();
		await expect(page.locator('.bar-map-marker')).toHaveCount(0);
		await expect(preview).toHaveCount(0);
		await expect(page.getByRole('status')).toHaveText('Inga barer matchar dina filter.');
		await filters.getByRole('button', { name: 'Rensa filter' }).click();
		await expect(page.locator('.bar-map-marker')).toHaveCount(2);
		await expect(priceLabel).toHaveText('80 kr*');
		await expect(shortMarker.locator('..').locator('.bar-map-marker-price')).toHaveCount(0);
		await expect(page.getByRole('status')).toHaveCount(0);
		await expect.poll(() => distanceFromMapCenter(page)).toBeLessThan(4);
	} finally {
		releaseResponse();
	}
});

test('retains selected attributes after errors and refreshes public map data after edits', async ({
	page
}) => {
	await installGeolocationMock(page);
	await login(page, 'test', 'testpass123');
	await page.goto(`/${shortSlug}/edit`);
	await openWizardStep(page, 'Bar');
	await page.getByRole('checkbox', { name: 'Quiz', exact: true }).check();
	// A slug that another review has is rejected by the server, which sends the choices back.
	await page.getByLabel('Länk', { exact: true }).fill(legacySlug);
	await finishWizardStep(page);
	await page.getByRole('button', { name: 'Spara ändringar' }).click();
	await expect(page.getByText('Sluggen finns redan', { exact: true }).first()).toBeVisible();
	for (const label of ['Quiz', 'Brädspel', 'Dart']) {
		await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
	}
	await page.getByLabel('Länk', { exact: true }).fill(shortSlug);
	await finishWizardStep(page);
	await page.getByRole('button', { name: 'Spara ändringar' }).click();
	await page.waitForURL(`**/${shortSlug}`);
	await expect(page.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
		'QuizBrädspelDart'
	);
	expect((await bars.findOne({ slug: shortSlug }))?.attributes).toEqual([
		'quiz',
		'boardGames',
		'darts'
	]);
	await page.goto('/karta?attributes=quiz');
	await expect(page.getByRole('button', { name: `Visa ${shortTitle} på kartan` })).toBeVisible();

	// Restore shared fixture data through the same edit workflow, including cache invalidation.
	await page.goto(`/${shortSlug}/edit`);
	await openWizardStep(page, 'Bar');
	await page.getByRole('checkbox', { name: 'Quiz', exact: true }).uncheck();
	await finishWizardStep(page);
	await page.getByRole('button', { name: 'Spara ändringar' }).click();
	await page.waitForURL(`**/${shortSlug}`);
	await page.goto('/karta?attributes=quiz');
	await expect(page.getByRole('button', { name: `Visa ${shortTitle} på kartan` })).toHaveCount(0);
});
