import { expect } from '@playwright/test';
import { login } from './fixtures/browser';
import { bars, fixtureImagePath, runId, test } from './fixtures/reviews';

test.describe('beer brand picker', () => {
	test('requires a beer, picks by keyboard, and shows the chosen logo', async ({ page }) => {
		const slug = `olvaljare-${runId}`;
		await login(page, 'test', 'testpass123');
		await page.goto('/admin/reviews/create');

		await page.getByLabel('Barens namn').fill(`Ölväljare ${runId}`);
		await page.getByLabel('Adress').fill('Ölgatan 1');
		await page.getByLabel('Pris för en stor stark').fill('65');
		await page.getByLabel('Din recension').fill('En recension utan vald öl.');
		await page.getByLabel('URL-slug').fill(slug);
		await page.locator('#image').setInputFiles(fixtureImagePath);
		await page.getByRole('button', { name: 'Spara utkast' }).click();

		const picker = page.getByRole('button', { name: 'Öl för en stor stark' });
		await expect(page.getByText('Välj vilken öl som serveras')).toBeVisible();
		await expect(picker).toBeFocused();
		await expect(picker).toHaveAccessibleDescription('Välj vilken öl som serveras');
		expect(await bars.findOne({ slug })).toBeNull();

		await picker.click();
		const dialog = page.getByRole('dialog', { name: 'Välj öl' });
		const firstTile = dialog.getByRole('radio').first();
		await expect(firstTile).toBeFocused();
		await expect(dialog.locator('img').first()).toHaveJSProperty('naturalWidth', 256);

		await page.keyboard.press('ArrowRight');
		await expect(dialog).toBeVisible();
		const secondTile = dialog.getByRole('radio').nth(1);
		await expect(secondTile).toBeChecked();
		const secondName = (await secondTile.locator('..').innerText()).trim();

		await page.keyboard.press('Enter');
		await expect(dialog).toBeHidden();
		await expect(picker).toBeFocused();
		await expect(picker).toContainText(secondName);
		await expect(picker.locator('img')).toHaveAttribute('src', /^\/beer-brands\/.+\.webp$/);
		await expect(page.getByText('Välj vilken öl som serveras')).toHaveCount(0);
		expect(await bars.findOne({ slug })).toBeNull();
	});
});
