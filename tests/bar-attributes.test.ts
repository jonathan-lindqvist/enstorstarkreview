import { expect } from '@playwright/test';
import {
	distanceFromMapCenter,
	emitGeolocationPosition,
	installGeolocationMock,
	login
} from './fixtures/browser';
import {
	bars,
	decoySlug,
	legacySlug,
	legacyTitle,
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
	// Other local public bars can have karaoke, independently of our fixture bars.
	const remainingMarkers = await page.locator('.bar-map-marker').count();
	if (remainingMarkers === 0) {
		await expect(page.getByRole('status')).toHaveText('Inga barer matchar dina filter.');
	} else {
		await expect(page.getByRole('status')).toHaveCount(0);
	}
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

test('retains selected attributes after errors and refreshes public map data after edits', async ({
	page
}) => {
	await installGeolocationMock(page);
	await login(page, 'test', 'testpass123');
	await page.goto(`/${shortSlug}/edit`);
	await page.getByRole('checkbox', { name: 'Quiz', exact: true }).check();
	await page.getByLabel('Barens namn').fill('   ');
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await expect(page.getByText('Ogiltigt namn på baren').first()).toBeVisible();
	for (const label of ['Quiz', 'Brädspel', 'Dart']) {
		await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
	}
	await page.getByLabel('Barens namn').fill(shortTitle);
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
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
	await page.getByRole('checkbox', { name: 'Quiz', exact: true }).uncheck();
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await page.waitForURL(`**/${shortSlug}`);
	await page.goto('/karta?attributes=quiz');
	await expect(page.getByRole('button', { name: `Visa ${shortTitle} på kartan` })).toHaveCount(0);
});
