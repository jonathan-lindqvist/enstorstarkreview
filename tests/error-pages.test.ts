import { expect, test } from '@playwright/test';

const missingSlug = `playwright-missing-${Date.now()}-${process.pid}`;
const heading = '419 Baren är inte recenserad';

for (const javaScriptEnabled of [true, false]) {
	test.describe(`custom error pages with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
		test.use({ javaScriptEnabled, viewport: { width: 390, height: 844 } });

		for (const { label, path } of [
			{ label: 'a missing review', path: `/${missingSlug}` },
			{ label: 'an unmatched nested URL', path: `/${missingSlug}/missing/nested-page` }
		]) {
			test(`shows the Swedish message and returns HTTP 404 for ${label}`, async ({ page }) => {
				const response = await page.goto(path);

				expect(response?.status()).toBe(404);
				await expect(
					page.getByRole('heading', { level: 1, name: heading, exact: true })
				).toBeVisible();
				await expect(page).toHaveTitle(`${heading}`);
				await expect(page.getByRole('navigation')).toBeVisible();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
				).toBe(true);

				await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
				await expect(page).toHaveURL('/');
				await expect(
					page.getByRole('heading', { level: 1, name: heading, exact: true })
				).toHaveCount(0);
			});
		}
	});
}
