import { expect } from '@playwright/test';
import {
	test,
	legacySlug,
	legacyAddress,
	publisherUsername,
	publisherPassword,
	loginRateLimits,
	isolatedQuota,
	fixtureImagePath,
	runId
} from './fixtures/reviews';
import {
	login,
	installGeolocationMock,
	emitGeolocationPosition,
	emitGeolocationError,
	readGeolocationWatchCount,
	readGeolocationState,
	nextWizardStep
} from './fixtures/browser';
test('normal form uses saved address, excludes itself, and clears an explicitly requested location', async ({
	page
}) => {
	await installGeolocationMock(page);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto(`/${legacySlug}/edit`);
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await expect(guidance).toContainText('adressens sparade position');
	await expect(guidance.locator('dd').first()).toHaveText('2');
	await expect(guidance.locator(`a[href$="/${legacySlug}"]`)).toHaveCount(0);
	expect(await readGeolocationWatchCount(page)).toBe(0);
	for (const width of [375, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await guidance.screenshot({ path: `/tmp/qol-nearby-${width}-${theme}.png` });
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
			).toBe(true);
		}
	}
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.getByLabel('Adress', { exact: true }).fill(`Okänd gata ${runId}`);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await emitGeolocationPosition(page, 57.72, 12.03, 10);
	await expect(guidance).toContainText('din position');
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds).toContain(73);
	await page.getByLabel('Adress', { exact: true }).fill('En annan okänd gata');
	await expect(guidance.locator('dd')).toHaveCount(0);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await emitGeolocationError(page, 1);
	await expect(guidance).toContainText('Platsåtkomst nekades');
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds.length).toBe(2);
	await guidance.getByRole('button', { name: 'Använd min position' }).click();
	await page.getByRole('link', { name: 'Hem', exact: true }).click();
	await expect.poll(async () => (await readGeolocationState(page)).clearWatchIds.length).toBe(3);
});

test('wizard shows the same helper beside barhop rating without changing its score', async ({
	page
}) => {
	await installGeolocationMock(page);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	await page.goto('/admin/reviews/create/wizard');
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill('Test av närhet');
	await page.getByLabel('Adress', { exact: true }).fill(legacyAddress);
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByRole('radio', { name: 'Falcon Export', exact: true }).check();
	await nextWizardStep(page);
	for (let aspect = 0; aspect < 7; aspect += 1) await nextWizardStep(page);
	const guidance = page.getByRole('region', { name: 'Recenserade barer i närheten' });
	await expect(guidance).toBeVisible();
	await expect(guidance.locator('dd').first()).toHaveText('3');
	await expect(page.locator('#barhopPotential input[value="0"]')).toBeChecked();
	expect(await readGeolocationWatchCount(page)).toBe(0);
});
