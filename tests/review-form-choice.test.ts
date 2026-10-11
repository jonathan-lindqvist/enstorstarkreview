import { expect } from '@playwright/test';
import { login } from './fixtures/browser';
import {
	bars,
	fixtureImagePath,
	isolatedQuota,
	listedBeerBrand,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	standardFormSlug,
	test
} from './fixtures/reviews';

test.describe.serial('review form choice', () => {
	test('offers both forms, ignores unknown choices, and the standard form saves a draft', async ({
		page
	}) => {
		await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
		await page.goto('/admin/reviews/create?formular=legacy');
		await expect(page.getByRole('navigation', { name: 'Välj formulär' })).toBeVisible();
		await page.goto('/admin/reviews/create');
		const choice = page.getByRole('navigation', { name: 'Välj formulär' });
		await expect(choice.getByRole('link', { name: 'Standard' })).toBeVisible();
		await expect(page.locator('form[enctype="multipart/form-data"]')).toHaveCount(0);

		await choice.getByRole('link', { name: 'Wizard (Beta)' }).click();
		await page.waitForURL('**/admin/reviews/create?formular=wizard');
		await expect(page.locator('#review-wizard')).toBeVisible();

		await page.getByRole('link', { name: 'Byt till standardformuläret' }).click();
		await page.waitForURL('**/admin/reviews/create?formular=standard');
		await expect(page.locator('#review-wizard')).toHaveCount(0);

		await page.getByLabel('Barens namn').fill(`Standardformulär ${runId}`);
		await page.getByLabel('Adress').fill('Standardgatan 1');
		await page.getByLabel('Öl för en stor stark').selectOption(listedBeerBrand);
		await page.getByLabel('Pris för en stor stark').fill('65');
		await page.getByLabel('Din recension').fill('Skapad med standardformuläret.');
		await page.getByLabel('URL-slug').fill(standardFormSlug);
		await page.locator('#image').setInputFiles(fixtureImagePath);
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await page.waitForURL(`**/${standardFormSlug}`);
		expect(await bars.findOne({ slug: standardFormSlug })).toMatchObject({
			publicationStatus: 'draft',
			author: publisherUsername
		});
	});
});
