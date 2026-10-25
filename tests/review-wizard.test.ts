import { expect, type Locator, type Page } from '@playwright/test';
import { fillNewReviewSlug, login, nextWizardStep, rateEveryAspect } from './fixtures/browser';
import {
	bars,
	customBeerBrand,
	fixtureImagePath,
	isolatedQuota,
	legacySlug,
	listedBeerBrand,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	test,
	wizardSlug,
	wizardTitle
} from './fixtures/reviews';

// The wizard is in beta: only this URL opens it, and no page links to it.
const wizardPath = '/admin/reviews/create/wizard';

const signIn = (page: Page) =>
	isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));

/** Walks a new review from the photo to the text step. */
const walkToTextStep = async (page: Page, title: string, slug?: string) => {
	await page.goto(wizardPath);
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill(title);
	await page.getByLabel('Adress').fill('Wizardgatan 2');
	if (slug !== undefined) await fillNewReviewSlug(page, slug);
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByRole('radio', { name: listedBeerBrand, exact: true }).check();
	await nextWizardStep(page);
	await rateEveryAspect(page, 3);
};

const expectActionAfterStep = async (page: Page, step: Locator, action: Locator) => {
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect
		.poll(async () => {
			const stepBox = await step.boundingBox();
			const actionBox = await action.boundingBox();
			return stepBox && actionBox ? actionBox.y - (stepBox.y + stepBox.height) : -Infinity;
		})
		.toBeGreaterThanOrEqual(0);
	await expect(action).not.toBeInViewport();
	await action.scrollIntoViewIfNeeded();
	await expect(action).toBeInViewport();
};

for (const width of [375, 1280]) {
	test(`places wizard actions after the content at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 667 });
		await signIn(page);
		await walkToTextStep(page, `Wizardlayout ${width} ${runId}`);
		await page
			.getByLabel('Recension', { exact: true })
			.fill('En trevlig kväll med god öl och plats för alla runt bordet.\n\n'.repeat(20));
		await page.getByRole('button', { name: 'Förhandsvisa' }).click();

		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await expectActionAfterStep(
				page,
				page.locator('#wizard-step-text'),
				page.getByRole('button', { name: /^Nästa: / })
			);
			await page.screenshot({ path: testInfo.outputPath(`next-${theme}.png`) });
		}

		await nextWizardStep(page);
		for (const theme of ['light', 'dark']) {
			await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
			await expectActionAfterStep(
				page,
				page.locator('#wizard-step-authors'),
				page.getByRole('button', { name: 'Spara utkast' })
			);
			await page.screenshot({ path: testInfo.outputPath(`save-${theme}.png`) });
		}
	});
}

test.describe.serial('review wizard', () => {
	test('is hidden from visitors and from the create flow', async ({ page }) => {
		await page.goto(wizardPath);
		await page.waitForURL('**/login');
		expect(await bars.findOne({ slug: wizardSlug })).toBeNull();

		await signIn(page);
		for (const path of ['/admin/reviews', '/admin/reviews/create']) {
			await page.goto(path);
			await expect(page.locator(`a[href*="${wizardPath}"]`)).toHaveCount(0);
		}
		// The create page still shows the one-page form.
		await expect(page.locator('#review-wizard')).toHaveCount(0);
		await expect(page.getByLabel('Din recension')).toBeVisible();
	});

	test('creates a draft step by step', async ({ page }) => {
		await signIn(page);
		await page.goto(wizardPath);
		await expect(page.getByRole('button', { name: /^Nästa: / })).toBeHidden();
		await page.locator('#image').setInputFiles(fixtureImagePath);
		await expect(page.getByRole('button', { name: 'Bildutsnitt' })).toBeVisible();
		await nextWizardStep(page);

		// Each step checks its own fields before the next one opens.
		await nextWizardStep(page);
		await expect(page.getByText('Skriv barens namn.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Barens namn' })).toBeFocused();
		await page.getByRole('textbox', { name: 'Barens namn' }).fill(wizardTitle);
		await page.getByLabel('Adress').fill('Wizardgatan 1');
		await page.getByRole('checkbox', { name: 'Quiz', exact: true }).check();
		await page.getByRole('checkbox', { name: 'Karaoke', exact: true }).check();
		await expect(page.locator('#slug')).toHaveValue(wizardSlug);
		// Enter in a field moves on instead of saving.
		await page.getByLabel('Adress').press('Enter');

		await page.getByLabel('Pris för en stor stark').fill('72');
		await page.getByRole('radio', { name: 'Annat märke' }).check();
		await page.getByLabel('Märkets namn').fill(customBeerBrand);
		await nextWizardStep(page);

		await rateEveryAspect(page, 4);
		await expect(
			page.getByRole('button', { name: 'Helhetsbetyg 2 av 3. Ändra till 3 av 3.' })
		).toBeVisible();
		await page.getByRole('button', { name: 'Helhetsbetyg 2 av 3. Ändra till 3 av 3.' }).click();
		await page.getByLabel('Recension', { exact: true }).fill('- Skapad med wizarden.');
		await nextWizardStep(page);

		await expect(
			page
				.getByRole('group', { name: 'Författare', exact: true })
				.getByRole('checkbox', { name: publisherUsername, exact: true })
		).toBeChecked();
		await expect(page.getByTestId('card-preview')).toContainText(wizardTitle);
		await expect(
			page.getByTestId('card-preview').locator('img[src^="/rating-glass/"]')
		).toHaveAttribute('src', '/rating-glass/3.png');

		// Earlier steps keep their values.
		await page.getByRole('button', { name: 'Steg 2 av 6, Bar' }).click();
		await expect(page.getByRole('textbox', { name: 'Barens namn' })).toHaveValue(wizardTitle);
		await page.getByRole('button', { name: 'Steg 6 av 6, Vem' }).click();
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await page.waitForURL(`**/${wizardSlug}`);

		expect(await bars.findOne({ slug: wizardSlug })).toMatchObject({
			title: wizardTitle,
			publicationStatus: 'draft',
			author: publisherUsername,
			attributes: ['quiz', 'karaoke'],
			beerBrand: customBeerBrand,
			beerPriceKr: 72,
			atmosphere: 4,
			rating: 3
		});
	});

	test('cycles the glass with pointer and keyboard and retains it after a rejected save', async ({
		page
	}, testInfo) => {
		await signIn(page);
		await walkToTextStep(page, `Wizardglas ${runId}`);
		const glassButton = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
		const field = page.locator('input[name="rating"]');
		const expectRating = async (rating: number) => {
			await expect(field).toHaveValue(String(rating));
			await expect(glassButton).toHaveAccessibleName(
				`Helhetsbetyg ${rating} av 3. Ändra till ${(rating + 1) % 4} av 3.`
			);
			if (rating > 0) {
				await expect(glassButton.locator('img:visible')).toHaveAttribute(
					'src',
					`/rating-glass/${rating}.png`
				);
			} else {
				await expect(glassButton.locator('img:visible')).toHaveCount(0);
				await expect(glassButton).toHaveText('Ingen stämpel');
			}
			expect(await page.locator('#wizard-step-text .glass-panel').first().innerText()).not.toMatch(
				/\d\s*\/3/
			);
		};
		await expectRating(1);
		await glassButton.click();
		await expectRating(2);
		await glassButton.press('Enter');
		await expectRating(3);
		await expect(page.getByRole('heading', { name: 'Hur var helheten?' })).toBeVisible();
		await expect(glassButton).toBeFocused();
		for (const width of [375, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			for (const theme of ['light', 'dark']) {
				await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
				await page
					.locator('#wizard-step-text .glass-panel')
					.first()
					.screenshot({
						path: testInfo.outputPath(`rating-${width}-${theme}.png`)
					});
			}
		}
		await glassButton.press('Space');
		await expectRating(0);
		await page.getByRole('button', { name: 'Använd förslaget' }).click();
		await expectRating(1);
		await expect(page.getByText('Förslag från delbetygen.', { exact: true })).toBeVisible();
		await glassButton.click();
		await expectRating(2);
		await page.getByLabel('Recension', { exact: true }).fill('Ett nytt glasbetyg.');
		await nextWizardStep(page);
		const preview = page.getByTestId('card-preview');
		await expect(preview).not.toContainText('Ett nytt glasbetyg.');
		await expect(preview.locator('img[src^="/rating-glass/"]')).toHaveAttribute(
			'src',
			'/rating-glass/2.png'
		);
		// An invalid save must preserve the manually chosen score and its preview.
		await page.getByRole('button', { name: 'Steg 2 av 6, Bar' }).click();
		await fillNewReviewSlug(page, legacySlug);
		await page.getByRole('button', { name: 'Steg 6 av 6, Vem' }).click();
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await expect(page.getByRole('alert').filter({ hasText: 'Sluggen finns redan' })).toBeVisible();
		await page.getByRole('button', { name: 'Steg 5 av 6, Helhet & text' }).click();
		await expectRating(2);
		expect(await bars.findOne({ title: `Wizardglas ${runId}` })).toBeNull();
	});

	test('asks for the photo again and keeps the warning after a rejected save', async ({ page }) => {
		const title = `Wizardkrock ${runId}`;
		await signIn(page);
		await walkToTextStep(page, title, legacySlug);
		await page.getByLabel('Recension', { exact: true }).fill('Länken finns redan.');
		await nextWizardStep(page);
		await page.getByRole('button', { name: 'Spara utkast' }).click();

		// The server rejects the taken link and the bar step opens on it.
		await expect(page.getByRole('alert').filter({ hasText: 'Sluggen finns redan' })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${wizardPath}$`));
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
		await expect(page).toHaveURL(new RegExp(`${wizardPath}$`));
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
		await fillNewReviewSlug(page, '!!! ---');
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
});
