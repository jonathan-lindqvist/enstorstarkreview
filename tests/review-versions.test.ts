import { expect } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { chooseBeerBrand, login } from './fixtures/browser';
import {
	auditLogs,
	bars,
	legacySlug,
	listedBeerBrand,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';

const versionSlug = `playwright-version-${runId}`;
const otherEdit = 'Någon annan hann ändra recensionen först.';
const myEdit = 'Min ändring som inte får skriva över den andra.';

test.afterAll(async () => {
	await bars.deleteMany({ slug: versionSlug });
	await auditLogs.deleteMany({ targetSlug: versionSlug });
});

test('an edit page opened before another save never overwrites it', async ({ page }) => {
	const legacy = await bars.findOne({ slug: legacySlug });
	if (!legacy) throw new Error('Missing legacy review fixture');
	const id = new ObjectId();
	await bars.insertOne({ ...legacy, _id: id, slug: versionSlug, title: `Version ${runId}` });

	await login(page, publisherUsername, publisherPassword);
	await page.goto(`/${versionSlug}/edit`);
	// The legacy fixture predates the required beer fields.
	await chooseBeerBrand(page, listedBeerBrand);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByLabel('Din recension').fill(myEdit);

	// Someone else saves while this page is open.
	await bars.updateOne({ _id: id }, { $set: { description: otherEdit, updatedAt: new Date() } });
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();

	await expect(page.getByRole('alert').first()).toContainText(
		'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.'
	);
	await expect(page.getByLabel('Din recension')).toHaveValue(myEdit);
	expect(await bars.findOne({ _id: id })).toMatchObject({ description: otherEdit });
	expect(
		await auditLogs.countDocuments({
			eventType: 'review_edit',
			outcome: 'failure',
			reason: 'stale_precondition',
			targetSlug: versionSlug
		})
	).toBe(1);

	// The page now shows the current version, so saving again is a deliberate overwrite.
	await page.getByRole('button', { name: 'Uppdatera recension' }).click();
	await page.waitForURL(`**/${versionSlug}`);
	expect(await bars.findOne({ _id: id })).toMatchObject({ description: myEdit });
});
