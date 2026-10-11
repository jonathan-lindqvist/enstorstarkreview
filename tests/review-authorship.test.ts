import { expect } from '@playwright/test';
import {
	fillNewReviewSlug,
	finishWizardStep,
	login,
	nextWizardStep,
	openWizardStep,
	rateEveryAspect
} from './fixtures/browser';
import {
	authorshipSlug,
	bars,
	fixtureImagePath,
	formerCoAuthor,
	formerPrimary,
	legacySlug,
	listedBeerBrand,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';

test.describe.serial('authorship', () => {
	test('selects authors on create and edit, restores errors, and lets the editor opt out', async ({
		page
	}) => {
		test.setTimeout(60_000);
		await login(page, publisherUsername, publisherPassword);
		await page.goto('/admin/reviews/create');
		await page.locator('#image').setInputFiles(fixtureImagePath);
		await nextWizardStep(page);
		await page.getByRole('textbox', { name: 'Barens namn' }).fill(`Författartest ${runId}`);
		await page.getByLabel('Adress').fill('Författargatan 1');
		await fillNewReviewSlug(page, authorshipSlug);
		await nextWizardStep(page);
		await page.getByLabel('Pris för en stor stark').fill('65');
		await page.getByRole('radio', { name: listedBeerBrand, exact: true }).check();
		await nextWizardStep(page);
		await rateEveryAspect(page, 3);
		await page
			.getByLabel('Recension', { exact: true })
			.fill('En recension med valbara författare.');
		await nextWizardStep(page);

		const checklist = page.getByRole('group', { name: 'Författare', exact: true });
		const editor = checklist.getByRole('checkbox', { name: publisherUsername, exact: true });
		const originalAuthor = checklist.getByRole('checkbox', { name: 'test', exact: true });
		await expect(editor).toBeChecked();
		await expect(checklist.locator('input:checked')).toHaveCount(1);
		await expect(checklist.getByRole('checkbox').first()).toHaveValue(publisherUsername);
		await editor.uncheck();
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await expect(page.locator('#authors-error')).toHaveText('Välj minst en författare');
		await expect(checklist.locator('input:checked')).toHaveCount(0);
		expect(await bars.findOne({ slug: authorshipSlug })).toBeNull();

		await originalAuthor.check();
		await page.getByRole('button', { name: 'Spara utkast' }).click();
		await page.waitForURL(`**/${authorshipSlug}`);
		const created = await bars.findOne({ slug: authorshipSlug });
		expect(created).toMatchObject({ author: 'test', coAuthors: [] });

		// These previously credited names deliberately have no registered user.
		await bars.updateOne(
			{ slug: authorshipSlug },
			{
				$set: { coAuthors: [formerPrimary, formerCoAuthor] }
			}
		);
		await page.goto(`/${authorshipSlug}/edit`);
		await openWizardStep(page, 'Vem');
		const formerFirst = checklist.getByRole('checkbox', { name: formerPrimary, exact: true });
		const formerSecond = checklist.getByRole('checkbox', { name: formerCoAuthor, exact: true });
		await expect(editor).toBeChecked();
		await expect(originalAuthor).toBeChecked();
		await expect(formerFirst).toBeChecked();
		await expect(formerSecond).toBeChecked();
		expect(
			await checklist
				.getByRole('checkbox')
				.evaluateAll((inputs) =>
					inputs.slice(0, 4).map((input) => (input as HTMLInputElement).value)
				)
		).toEqual([publisherUsername, 'test', formerPrimary, formerCoAuthor]);

		await editor.uncheck();
		await originalAuthor.uncheck();
		await finishWizardStep(page);
		await openWizardStep(page, 'Bar');
		await page.getByLabel('Länk', { exact: true }).fill(legacySlug);
		await finishWizardStep(page);
		await page.getByRole('button', { name: 'Spara ändringar' }).click();
		// A rejected save opens the step with the field that the server named.
		await expect(page.getByText('Sluggen finns redan', { exact: true }).first()).toBeVisible();
		await expect(page.getByLabel('Länk', { exact: true })).toBeFocused();
		await page.getByRole('button', { name: 'Alla steg' }).click();
		await openWizardStep(page, 'Vem');
		await expect(editor).not.toBeChecked();
		await expect(originalAuthor).not.toBeChecked();
		await expect(formerFirst).toBeChecked();
		await expect(formerSecond).toBeChecked();

		// The wizard does not let an edit leave a step without an author.
		await formerFirst.uncheck();
		await formerSecond.uncheck();
		await page.getByRole('button', { name: 'Klar' }).click();
		await expect(page.locator('#authors-error')).toHaveText('Välj minst en författare');
		await expect(checklist.locator('input:checked')).toHaveCount(0);

		await originalAuthor.check();
		await formerFirst.check();
		await formerSecond.check();
		await finishWizardStep(page);
		await openWizardStep(page, 'Bar');
		await page.getByLabel('Länk', { exact: true }).fill(authorshipSlug);
		await finishWizardStep(page);
		await openWizardStep(page, 'Helhet & text');
		await page
			.getByLabel('Recension', { exact: true })
			.fill('En snabb rättning utan att redaktören får författarcredit.');
		await finishWizardStep(page);
		await page.getByRole('button', { name: 'Spara ändringar' }).click();
		await page.waitForURL(`**/${authorshipSlug}`);
		const edited = await bars.findOne({ slug: authorshipSlug });
		expect(edited).toMatchObject({ author: 'test', coAuthors: [formerPrimary, formerCoAuthor] });
		expect(edited?.changeLog.at(-1)).toMatchObject({ updatedBy: publisherUsername });
		expect(
			edited?.changeLog.at(-1).changes.map((change: { field: string }) => change.field)
		).toEqual(['description']);

		await page.goto(`/${authorshipSlug}/edit`);
		await openWizardStep(page, 'Vem');
		await editor.uncheck();
		await originalAuthor.uncheck();
		await finishWizardStep(page);
		await page.getByRole('button', { name: 'Spara ändringar' }).click();
		await page.waitForURL(`**/${authorshipSlug}`);
		expect(await bars.findOne({ slug: authorshipSlug })).toMatchObject({
			author: formerPrimary,
			coAuthors: [formerCoAuthor]
		});
	});
});
