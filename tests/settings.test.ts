import { expect, type Page } from '@playwright/test';
import {
	isolatedQuota,
	legacySlug,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	test
} from './fixtures/reviews';
import {
	emitGeolocationPosition,
	installGeolocationMock,
	login,
	readGeolocationState,
	readGeolocationWatchCount
} from './fixtures/browser';

const changeLocationPreference = (page: Page, enabled: boolean) =>
	page.evaluate((value) => {
		document.cookie = `location_enabled=${value}; Path=/; SameSite=Lax`;
		window.dispatchEvent(new Event('preferenceschange'));
	}, enabled);

const consentCommands = (page: Page) =>
	page.evaluate(() =>
		((window as typeof window & { dataLayer?: Array<ArrayLike<unknown>> }).dataLayer ?? [])
			.map((entry) => Array.from(entry))
			.filter((entry) => entry[0] === 'consent')
	);

test.beforeEach(async ({ page }) => {
	await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ body: '' }));
	await page.route(/https:\/\/[^/]*google-analytics\.com\//, (route) => route.abort());
	await installGeolocationMock(page);
});

test('offers public settings with the existing defaults and no location watcher', async ({
	page
}) => {
	const response = await page.goto('/installningar');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Inställningar', exact: true })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Använd min position' })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'Ljust', exact: true })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'Tillåt analyscookies' })).not.toBeChecked();
	await expect(page.getByRole('radio', { name: 'Avböj analyscookies' })).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Mörkt läge' })).toHaveCount(0);
	expect(await readGeolocationWatchCount(page)).toBe(0);
});

test('saves theme immediately, persists across navigation, and renders the saved first paint', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/installningar');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await page.getByRole('radio', { name: 'Mörkt', exact: true }).check();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('link', { name: 'FAQ', exact: true }).click();
	await page.getByRole('link', { name: 'Inställningar', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Mörkt', exact: true })).toBeChecked();
	const response = await page.reload();
	expect(await response?.text()).toContain('data-theme="dark"');
	await page.getByRole('radio', { name: 'Ljust', exact: true }).check();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('synchronizes banner and settings consent and handles unavailable analytics', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Inställningar', exact: true }).last().click();
	await expect(page.getByRole('radio', { name: 'Tillåt analyscookies' })).not.toBeChecked();
	await page.getByRole('button', { name: 'Godkänn', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Tillåt analyscookies' })).toBeChecked();
	await expect(page.getByRole('button', { name: 'Godkänn', exact: true })).toHaveCount(0);
	await page.getByRole('radio', { name: 'Avböj analyscookies' }).check();
	expect((await consentCommands(page)).slice(-2)).toEqual(
		['granted', 'denied'].map((value) => [
			'consent',
			'update',
			{
				analytics_storage: value,
				ad_storage: 'denied',
				ad_user_data: 'denied',
				ad_personalization: 'denied'
			}
		])
	);
	await page.reload();
	await expect(page.getByRole('radio', { name: 'Avböj analyscookies' })).toBeChecked();
	expect((await consentCommands(page))[0][2]).toMatchObject({ analytics_storage: 'denied' });
	await page.evaluate(() => Reflect.deleteProperty(window, 'gtag'));
	await page.getByRole('radio', { name: 'Tillåt analyscookies' }).check();
	await page.reload();
	await expect(page.getByRole('radio', { name: 'Tillåt analyscookies' })).toBeChecked();
	expect((await consentCommands(page))[0][2]).toMatchObject({ analytics_storage: 'granted' });
});

test('a settings consent choice dismisses the banner and survives client navigation', async ({
	page
}) => {
	await page.goto('/installningar');
	await page.getByRole('radio', { name: 'Avböj analyscookies' }).check();
	await expect(page.getByRole('button', { name: 'Avböj', exact: true })).toHaveCount(0);
	await page.getByRole('link', { name: 'FAQ', exact: true }).click();
	await page.getByRole('link', { name: 'Inställningar', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Avböj analyscookies' })).toBeChecked();
	await expect(page.getByRole('button', { name: 'Godkänn', exact: true })).toHaveCount(0);
});

test('disabled location blocks home, detail, map, and explicit review-form requests', async ({
	page
}) => {
	await page.goto('/installningar');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Använd min position' }).uncheck();
	await page.reload();
	await expect(page.getByRole('checkbox', { name: 'Använd min position' })).not.toBeChecked();
	const cookie = (await page.context().cookies()).find(
		(entry) => entry.name === 'location_enabled'
	);
	expect(cookie).toMatchObject({ value: 'false', path: '/', sameSite: 'Lax' });
	expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 86400);
	await page.goto('/?sort=nearest');
	await expect(page.getByRole('status')).toContainText('Platsåtkomst är avstängd');
	await expect(page.getByRole('status').getByRole('link', { name: 'Inställningar' })).toBeVisible();
	expect(await readGeolocationWatchCount(page)).toBe(0);
	await page.goto(`/${legacySlug}`);
	await expect(page.getByTestId('review-distance')).toHaveCount(0);
	expect(await readGeolocationWatchCount(page)).toBe(0);
	await page.goto('/karta');
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await expect(page.getByRole('img', { name: 'Din aktuella position' })).toHaveCount(0);
	expect(await readGeolocationWatchCount(page)).toBe(0);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${legacySlug}/edit`);
	await page.getByLabel('Adress', { exact: true }).fill('Okänd inställningsgata');
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await expect(guidance.getByRole('button', { name: 'Använd min position' })).toBeDisabled();
	await expect(guidance.getByRole('link', { name: 'Inställningar' })).toBeVisible();
	expect(await readGeolocationWatchCount(page)).toBe(0);
	await page.goto('/installningar');
	await page.getByRole('checkbox', { name: 'Använd min position' }).check();
	expect(await readGeolocationWatchCount(page)).toBe(0);
	await page.getByRole('link', { name: 'Hem', exact: true }).click();
	await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
});

test('stops active location, clears distances and map markers, and ignores late fixes', async ({
	page,
	baseURL
}) => {
	await page.context().addCookies([{ name: 'analytics_consent', value: 'denied', url: baseURL! }]);
	for (const path of ['/?sort=nearest', `/${legacySlug}`, '/karta']) {
		await page.goto(path);
		await expect.poll(() => readGeolocationWatchCount(page)).toBe(1);
		await emitGeolocationPosition(page, 57.72, 12.03, 80);
		if (path === '/karta')
			await expect(page.getByRole('img', { name: 'Din aktuella position' })).toBeAttached();
		else await expect(page.getByTestId('review-distance').first()).toBeVisible();
		await changeLocationPreference(page, false);
		await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toContain(73);
		await emitGeolocationPosition(page, 57.73, 12.04, 80);
		await expect(page.getByRole('img', { name: 'Din aktuella position' })).toHaveCount(0);
		await expect(page.getByTestId('review-distance')).toHaveCount(0);
		if (path.startsWith('/?'))
			await expect(page.getByRole('status')).toContainText('Platsåtkomst är avstängd');
		await changeLocationPreference(page, true);
		await expect.poll(() => readGeolocationWatchCount(page)).toBe(2);
		await emitGeolocationPosition(page, 57.72, 12.03, 80);
		if (path === '/karta')
			await expect(page.getByRole('img', { name: 'Din aktuella position' })).toBeAttached();
		else await expect(page.getByTestId('review-distance').first()).toBeVisible();
	}
});

test('malformed preferences agree between server rendering, controls, and analytics bootstrap', async ({
	page,
	baseURL
}) => {
	await page.context().addCookies([
		{ name: 'location_enabled', value: 'unknown', url: baseURL! },
		{ name: 'theme', value: 'system', url: baseURL! },
		{ name: 'analytics_consent', value: 'granted-extra', url: baseURL! }
	]);
	const response = await page.goto('/installningar');
	expect(await response?.text()).toContain('data-theme="light"');
	await expect(page.getByRole('checkbox', { name: 'Använd min position' })).not.toBeChecked();
	await expect(page.getByRole('radio', { name: 'Ljust', exact: true })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'Tillåt analyscookies' })).not.toBeChecked();
	await expect(page.getByRole('radio', { name: 'Avböj analyscookies' })).not.toBeChecked();
	expect((await consentCommands(page))[0][2]).toMatchObject({ analytics_storage: 'denied' });
});

test('navigation and controls fit phone and desktop in both themes, including signed-in navigation', async ({
	page
}, testInfo) => {
	await page.goto('/installningar');
	await page.getByRole('button', { name: 'Avböj', exact: true }).click();
	for (const width of [375, 1024, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['Ljust', 'Mörkt']) {
			await page.getByRole('radio', { name: theme, exact: true }).check();
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
			if (width < 1024) await page.getByRole('button', { name: 'Meny', exact: true }).click();
			const navigation =
				width < 1024
					? page.getByRole('dialog', { name: 'Meny', exact: true })
					: page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('list').first();
			const settings = navigation.getByRole('link', { name: 'Inställningar', exact: true });
			await expect(settings).toBeVisible();
			await expect(settings).toHaveAttribute('aria-current', 'page');
			if (width < 1024) {
				await page.keyboard.press('Escape');
				await expect(page.getByRole('dialog', { name: 'Meny', exact: true })).not.toBeVisible();
			}
			await page.screenshot({
				path: testInfo.outputPath(`settings-${width}-${theme}.png`),
				animations: 'disabled',
				fullPage: true
			});
		}
	}
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto('/installningar');
	await page.setViewportSize({ width: 1024, height: 900 });
	await expect(page.getByRole('link', { name: 'Skapa utkast' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.getByRole('checkbox', { name: 'Använd min position' }).focus();
	await page.keyboard.press('Space');
	await expect(page.getByRole('checkbox', { name: 'Använd min position' })).not.toBeChecked();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('radio', { name: 'Mörkt', exact: true })).toBeFocused();
});

test('disabling location clears a completed review-form position without restarting its watch', async ({
	page
}) => {
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${legacySlug}/edit`);
	await page.getByLabel('Adress', { exact: true }).fill('Okänd inställningsgata');
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await emitGeolocationPosition(page, 57.72, 12.03, 80);
	await expect(guidance.locator('dd').first()).toBeVisible();
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toContain(73);
	await changeLocationPreference(page, false);
	await expect(guidance.locator('dd')).toHaveCount(0);
	await expect(guidance.getByRole('button', { name: 'Använd min position' })).toBeDisabled();
	await expect(guidance.getByRole('link', { name: 'Inställningar' })).toBeVisible();
	await changeLocationPreference(page, true);
	await expect(guidance.getByRole('button', { name: 'Använd min position' })).toBeEnabled();
	expect(await readGeolocationWatchCount(page)).toBe(1);
});
