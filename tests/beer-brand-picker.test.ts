import { expect } from '@playwright/test';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { chooseBeerBrand, login } from './fixtures/browser';
import {
	bars,
	fixtureImagePath,
	isolatedQuota,
	loginRateLimits,
	reviewImageDirectory,
	runId,
	test
} from './fixtures/reviews';

const slug = `olvaljare-${runId}`;

test.afterAll(async () => {
	const review = await bars.findOne({ slug }, { projection: { image: 1 } });
	await bars.deleteMany({ slug });
	if (!review?.image) return;
	await unlink(join(reviewImageDirectory, review.image)).catch(() => undefined);
	for (const preset of ['card-v1', 'detail-v1'])
		await unlink(
			join(reviewImageDirectory, 'previews', 'v1', `${review.image}.${preset}.webp`)
		).catch(() => undefined);
});

test.describe('beer brand picker', () => {
	test('saves an unknown beer, picks by keyboard, and clears the beer again', async ({ page }) => {
		// Keeps this login out of the shared per-IP quota that later specs rely on.
		await isolatedQuota(loginRateLimits, () => login(page, 'test', 'testpass123'));
		await page.goto('/admin/reviews/create');

		const picker = page.getByRole('button', { name: 'Öl för en stor stark' });
		await expect(picker).toContainText('Okänd öl');
		await page.getByLabel('Barens namn').fill(`Ölväljare ${runId}`);
		await page.getByLabel('Adress').fill('Ölgatan 1');
		await page.getByLabel('Pris för en stor stark').fill('65');
		await page.getByLabel('Din recension').fill('En recension utan känd öl.');
		await page.getByLabel('URL-slug').fill(slug);
		await page.locator('#image').setInputFiles(fixtureImagePath);
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await page.waitForURL(`**/${slug}`);

		expect(await bars.findOne({ slug })).toMatchObject({ beerBrand: null, beerPriceKr: 65 });
		await expect(page.getByText('65 kr', { exact: true })).toBeVisible();
		await expect(page.getByText(/Okänd öl|Öl ej angiven/)).toHaveCount(0);

		await page.goto(`/${slug}/edit`);
		await picker.click();
		const dialog = page.getByRole('dialog', { name: 'Välj öl' });
		const unknownTile = dialog.getByRole('radio', { name: 'Okänd öl', exact: true });
		await expect(unknownTile).toBeChecked();
		await expect(unknownTile).toBeFocused();
		await expect(dialog.locator('img').first()).toHaveJSProperty('naturalWidth', 256);

		// The unknown choice comes last, so the next arrow wraps around to the first brand.
		await page.keyboard.press('ArrowRight');
		await expect(dialog).toBeVisible();
		const firstTile = dialog.getByRole('radio').first();
		await expect(firstTile).toBeChecked();
		const firstName = (await firstTile.locator('..').innerText()).trim();

		await page.keyboard.press('Enter');
		await expect(dialog).toBeHidden();
		await expect(picker).toBeFocused();
		await expect(picker).toContainText(firstName);
		await expect(picker.locator('img')).toHaveAttribute('src', /^\/beer-brands\/.+\.webp$/);
		await page.getByRole('button', { name: 'Uppdatera recension' }).click();
		await page.waitForURL(`**/${slug}`);
		expect(await bars.findOne({ slug })).toMatchObject({ beerBrand: firstName });
		await expect(page.getByText(firstName, { exact: true })).toBeVisible();

		await page.goto(`/${slug}/edit`);
		await chooseBeerBrand(page, 'Okänd öl');
		await expect(picker).toContainText('Okänd öl');
		await page.getByRole('button', { name: 'Uppdatera recension' }).click();
		await page.waitForURL(`**/${slug}`);
		const cleared = await bars.findOne({ slug });
		expect(cleared).toMatchObject({ beerBrand: null });
		expect(cleared?.changeLog?.at(-1)?.changes).toContainEqual(
			expect.objectContaining({ field: 'beerBrand', before: firstName, after: 'Öl ej angiven' })
		);
		await expect(page.getByText(firstName, { exact: true })).toHaveCount(0);
	});
});
