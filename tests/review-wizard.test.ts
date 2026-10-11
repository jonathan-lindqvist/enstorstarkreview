import { expect, type Page } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
	finishWizardStep,
	login,
	nextWizardStep,
	openWizardStep,
	rateEveryAspect
} from './fixtures/browser';
import {
	bars,
	fixtureImagePath,
	isolatedQuota,
	legacyImage,
	legacySlug,
	listedBeerBrand,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	test,
	wizardSlug
} from './fixtures/reviews';

const createPath = '/admin/reviews/create?formular=wizard';

const signIn = (page: Page) =>
	isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));

/** Walks a new review from the photo to the text step. */
const walkToTextStep = async (page: Page, title: string, slug?: string) => {
	await page.goto(createPath);
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill(title);
	await page.getByLabel('Adress').fill('Wizardgatan 2');
	if (slug !== undefined) {
		await page.locator('summary', { hasText: 'Länk:' }).click();
		await page.locator('#slug').fill(slug);
	}
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByRole('radio', { name: listedBeerBrand, exact: true }).check();
	await nextWizardStep(page);
	await rateEveryAspect(page, 3);
};

test.describe.serial('review wizard', () => {
	test('asks for the photo again and keeps the warning after a rejected save', async ({ page }) => {
		const title = `Wizardkrock ${runId}`;
		await signIn(page);
		await walkToTextStep(page, title, legacySlug);
		await page.getByLabel('Recension', { exact: true }).fill('Länken finns redan.');
		await nextWizardStep(page);
		await page.getByRole('button', { name: 'Spara utkast' }).click();

		// The server rejects the taken link and the bar step opens on it.
		await expect(page.getByRole('alert').filter({ hasText: 'Sluggen finns redan' })).toBeVisible();
		await expect(page.locator('#slug')).toBeFocused();
		await expect(page.locator('#slug')).toHaveValue(legacySlug);
		await expect(page.getByRole('button', { name: 'Steg 1 av 6, Bild, har fel' })).toBeVisible();
		expect(await bars.findOne({ title })).toBeNull();

		// The browser never sends the chosen photo back, so saving again asks for it.
		await page.getByRole('button', { name: 'Steg 6 av 6, Vem' }).click();
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await expect(
			page.getByText('Välj bilden igen. Den följer inte med när utkastet inte kunde sparas.')
		).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Börja med en bild' })).toBeVisible();

		// The restored values are unsaved work even before they change.
		let warning = '';
		page.once('dialog', async (dialog) => {
			warning = dialog.message();
			await dialog.dismiss();
		});
		await page.getByRole('link', { name: 'Avbryt' }).click();
		await expect.poll(() => warning).toBe('Vill du lämna recensionen? Ändringarna sparas inte.');
		await expect(page).toHaveURL(new RegExp(`${createPath.replace('?', '\\?')}$`));
	});

	test('checks the link and the text on their steps', async ({ page }) => {
		const title = `Wizardtext ${runId}`;
		await signIn(page);
		await walkToTextStep(page, title);

		// Long values stop at the limits that the server accepts.
		await expect(page.locator('#bar-name')).toHaveAttribute('maxlength', '300');
		await expect(page.locator('#address')).toHaveAttribute('maxlength', '300');
		await expect(page.locator('#slug')).toHaveAttribute('maxlength', '200');
		await expect(page.locator('#description')).toHaveAttribute('maxlength', '20000');

		// A preview hides the field, so a missing text switches back to writing.
		await page.getByRole('button', { name: 'Förhandsvisa' }).click();
		await expect(page.getByText('Inget att visa än.')).toBeVisible();
		await nextWizardStep(page);
		await expect(page.getByText('Skriv några rader om baren.')).toBeVisible();
		await expect(page.getByLabel('Recension', { exact: true })).toBeFocused();
		await expect(page.getByRole('button', { name: 'Förhandsvisa' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);

		// A link without letters or digits is caught before the server sees it.
		await page.getByRole('button', { name: 'Steg 2 av 6, Bar' }).click();
		await page.locator('summary', { hasText: 'Länk:' }).click();
		await page.locator('#slug').fill('!!! ---');
		await nextWizardStep(page);
		await expect(
			page.getByText('Skriv en länk med bokstäver eller siffror, eller skapa en från namnet.')
		).toBeVisible();
		await expect(page.locator('#slug')).toBeFocused();
		await page.getByRole('button', { name: 'Skapa från namnet' }).click();
		await expect(page.locator('#slug')).toHaveValue(`wizardtext-${runId}`);
		await nextWizardStep(page);
		await expect(page.getByRole('heading', { name: 'Stor stark' })).toBeVisible();
		expect(await bars.findOne({ title })).toBeNull();
	});

	test('keeps the current photo when a chosen file is undone', async ({ page }) => {
		await signIn(page);
		await page.goto(`/${wizardSlug}/edit`);
		await openWizardStep(page, 'Bild');
		const photo = page.getByRole('button', { name: 'Bildutsnitt' }).locator('img');
		await expect(photo).toHaveAttribute('src', `/images/${legacyImage}`);
		await expect(page.getByRole('button', { name: 'Behåll nuvarande bild' })).toHaveCount(0);

		await page.locator('#image').setInputFiles(fixtureImagePath);
		await expect(photo).toHaveAttribute('src', /^blob:/);
		await page.getByRole('button', { name: 'Behåll nuvarande bild' }).click();
		await expect(photo).toHaveAttribute('src', `/images/${legacyImage}`);
		await expect(page.locator('#image')).toHaveValue('');
		await finishWizardStep(page);
		await expect(page.locator('#wizard-row-photo')).toContainText('Nuvarande bild');

		await openWizardStep(page, 'Bar');
		await page.getByLabel('Adress').fill('Wizardgatan 3');
		await finishWizardStep(page);
		await page.getByRole('button', { name: 'Spara ändringar' }).click();
		await page.waitForURL(`**/${wizardSlug}`);
		expect(await bars.findOne({ slug: wizardSlug })).toMatchObject({
			image: legacyImage,
			location: 'Wizardgatan 3'
		});
	});

	test('shows a failure of the whole save above the steps, not on a step', async ({ page }) => {
		await signIn(page);
		await page.goto(`/${wizardSlug}/edit`);
		// A review that does not exist makes the server reject the save as a whole.
		await page
			.locator('input[name="id"]')
			.evaluate(
				(input, id) => ((input as HTMLInputElement).value = id),
				new ObjectId().toHexString()
			);
		await page.getByRole('button', { name: 'Spara ändringar' }).click();

		await expect(page.getByRole('alert')).toBeVisible();
		await expect(page.getByRole('list', { name: 'Recensionens delar' })).toBeVisible();
		await expect(page.getByText('Behöver rättas')).toHaveCount(0);
		expect(await bars.findOne({ slug: wizardSlug })).toMatchObject({ location: 'Wizardgatan 3' });
	});
});
