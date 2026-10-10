import { expect } from '@playwright/test';
import {
	expectAnonymousNotFound,
	expectBackgroundPosition,
	expectImagePosition,
	expectSixteenByNine,
	expectSquare,
	login,
	setRange
} from './fixtures/browser';
import {
	auditLogs,
	bars,
	customBeerBrand,
	decoySlug,
	draftSlug,
	draftTitle,
	fixtureImagePath,
	legacyAddress,
	legacyImage,
	legacySlug,
	legacyTitle,
	listedBeerBrand,
	publisherPassword,
	publisherUsername,
	shortSlug,
	shortTitle,
	test
} from './fixtures/reviews';
let draftImage: string | undefined;

test.describe.serial('publication', () => {
	test('keeps legacy reviews public without a migration', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const detailResponse = await page.goto(`/${legacySlug}`);
		expect(detailResponse?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: legacyTitle })).toBeVisible();
		const legacyDetailImage = page.getByRole('img', { name: legacyTitle });
		await expectSquare(legacyDetailImage);
		await expectImagePosition(legacyDetailImage, '50% 50%');
		await expect(page.getByText('Skapad', { exact: false })).toBeVisible();
		await expect(page.getByText('Öl ej angiven', { exact: true })).toBeVisible();
		const mapLink = page.getByRole('link', { name: legacyAddress });
		await expect(mapLink).toHaveAttribute(
			'href',
			`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(legacyAddress)}`
		);
		await expect(mapLink).toHaveAttribute('target', '_blank');
		await expect(mapLink).toHaveAttribute('rel', /\bnoopener\b/);
		await expect(mapLink).toHaveAttribute('rel', /\bnoreferrer\b/);
		await expect(mapLink).toHaveAttribute('rel', /\bexternal\b/);
		const fullDescription = page.getByTestId('review-description');
		await expect(fullDescription.getByRole('heading', { name: 'Helhetsintryck' })).toBeVisible();
		await expect(fullDescription.locator('strong')).toHaveText('minnesvärd');
		await expect(fullDescription.locator('em')).toHaveText('livlig');
		await expect(fullDescription.locator('ul > li')).toHaveCount(2);
		await expect(fullDescription.locator('ol > li')).toHaveCount(2);

		await page.goto(`/${shortSlug}`);
		await expect(page.getByText(listedBeerBrand, { exact: true })).toBeVisible();
		const shortDetailImage = page.getByRole('img', { name: shortTitle });
		await expectSquare(shortDetailImage);
		await expectImagePosition(shortDetailImage, '25% 75%');
		await page.setViewportSize({ width: 1280, height: 900 });
		await expectSquare(shortDetailImage);
		await expectImagePosition(shortDetailImage, '25% 75%');
		await page.setViewportSize({ width: 390, height: 844 });
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
			)
		).toBe(true);

		await page.goto('/');
		const card = page.locator(`a[href="/${legacySlug}"]`);
		const shortCard = page.locator(`a[href="/${shortSlug}"]`);
		await expect(card.getByText('Öl ej angiven', { exact: true })).toBeVisible();
		await expect(shortCard.getByText(listedBeerBrand, { exact: true })).toBeVisible();
		const shortCardImage = shortCard.getByRole('img', { name: shortTitle });
		await expectSquare(shortCardImage);
		await expectBackgroundPosition(shortCardImage, '25% 75%');
		await page.setViewportSize({ width: 1280, height: 900 });
		await expectSquare(shortCardImage);
		await expectBackgroundPosition(shortCardImage, '25% 75%');
		await page.setViewportSize({ width: 390, height: 844 });
		const longPreview = card.getByTestId('review-description-preview');
		const shortPreview = shortCard.getByTestId('review-description-preview');
		await expect(longPreview.locator('strong')).toHaveText('minnesvärd');
		await expect(longPreview.locator('ul > li')).toHaveCount(2);
		await expect(shortPreview.locator('strong')).toHaveText('kort');

		const longPreviewSize = await longPreview.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
			overflow: window.getComputedStyle(element).overflow
		}));
		const shortPreviewSize = await shortPreview.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight
		}));

		expect(longPreviewSize).toMatchObject({ clientHeight: 80, overflow: 'hidden' });
		expect(shortPreviewSize).toMatchObject({ clientHeight: 80 });
		expect(longPreviewSize.scrollHeight).toBeGreaterThan(longPreviewSize.clientHeight);
		expect(shortPreviewSize.scrollHeight).toBeLessThanOrEqual(shortPreviewSize.clientHeight);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= document.documentElement.clientWidth
			)
		).toBe(true);

		await page.goto(`/?search=${encodeURIComponent(listedBeerBrand)}`);
		await expect(page.getByRole('heading', { name: shortTitle })).toBeVisible();
		await expect(page.getByRole('heading', { name: legacyTitle })).toHaveCount(0);

		const imageResponse = await page.request.get(`/images/${legacyImage}`);
		expect(imageResponse.status()).toBe(200);
		expect(imageResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
	});

	test('creates a private draft and publishes only the route review', async ({ browser }) => {
		test.setTimeout(60_000);

		const creatorContext = await browser.newContext();
		const creatorPage = await creatorContext.newPage();
		await login(creatorPage, 'test', 'testpass123');

		const adminThumbnail = creatorPage.getByRole('link', { name: `Öppna ${shortTitle}` });
		await expectSixteenByNine(adminThumbnail);
		await expectImagePosition(adminThumbnail.locator('img'), '25% 75%');

		await creatorPage.goto(`/${shortSlug}/edit`);
		const editorImageViewport = creatorPage.getByRole('button', { name: 'Bildutsnitt' });
		await expectSixteenByNine(editorImageViewport);
		await expectImagePosition(editorImageViewport.locator('img'), '25% 75%');

		await creatorPage.goto(`/${legacySlug}/edit`);
		const legacyBeerSelect = creatorPage.getByLabel('Öl för en stor stark');
		await expect(legacyBeerSelect).toHaveValue('');
		expect(
			await legacyBeerSelect.evaluate((select: HTMLSelectElement) => select.checkValidity())
		).toBe(false);

		await creatorPage.goto('/admin/reviews/create');
		await expect(
			creatorPage
				.getByRole('group', { name: 'Författare', exact: true })
				.getByRole('checkbox', { name: 'test', exact: true })
		).toBeChecked();
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Adress').fill('Utkastgatan 1');
		await creatorPage.getByLabel('Öl för en stor stark').selectOption('__other_beer__');
		await creatorPage.getByRole('checkbox', { name: 'Quiz', exact: true }).check();
		await creatorPage.getByRole('checkbox', { name: 'Karaoke', exact: true }).check();
		await creatorPage.getByLabel('Ange vilken öl').fill(customBeerBrand);
		await creatorPage.getByLabel('Pris för en stor stark').fill('1');
		await creatorPage.locator('#image').setInputFiles(fixtureImagePath);
		await creatorPage
			.getByLabel('Din recension')
			.fill('En fullständig recension som börjar privat.');
		await creatorPage.getByLabel('URL-slug').fill(draftSlug);
		for (const metric of [
			'atmosphere',
			'service',
			'selection',
			'quality',
			'price',
			'cleanliness',
			'soundLevel',
			'barhopPotential'
		]) {
			await setRange(creatorPage, metric, '4');
		}
		await setRange(creatorPage, 'rating', '2');
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Adress').fill('Utkastgatan 1');
		await expect(creatorPage.getByLabel('Barens namn')).toHaveValue(draftTitle);
		await expect(creatorPage.getByLabel('Adress')).toHaveValue('Utkastgatan 1');
		await creatorPage.getByRole('button', { name: 'Spara utkast' }).click();
		await creatorPage.waitForURL(`**/${draftSlug}`);

		await expect(creatorPage.getByText('Privat utkast')).toBeVisible();
		await expect(creatorPage.locator('[data-publication-status="draft"]').first()).toContainText(
			'Utkast'
		);

		const createdReview = await bars.findOne({ slug: draftSlug });
		expect(createdReview).toMatchObject({
			publicationStatus: 'draft',
			author: 'test',
			attributes: ['quiz', 'karaoke'],
			beerBrand: customBeerBrand
		});
		await expect(creatorPage.getByText(customBeerBrand, { exact: true })).toBeVisible();
		await expect(creatorPage.getByRole('list', { name: 'Aktiviteter och utbud' })).toHaveText(
			'QuizKaraoke'
		);
		draftImage = createdReview?.image as string;

		await creatorPage.goto(`/?search=${encodeURIComponent(customBeerBrand)}`);
		await expect(creatorPage.getByRole('heading', { name: draftTitle })).toBeVisible();
		await expect(
			creatorPage.locator(`a[href="/${draftSlug}"]`).locator('[data-publication-status="draft"]')
		).toBeVisible();

		await creatorPage.goto(`/${draftSlug}/edit`);
		await expect(creatorPage.getByRole('checkbox', { name: 'Quiz', exact: true })).toBeChecked();
		await creatorPage.getByRole('checkbox', { name: 'Quiz', exact: true }).uncheck();
		await creatorPage.getByRole('checkbox', { name: 'Karaoke', exact: true }).uncheck();
		await creatorPage.getByLabel('Barens namn').fill('   ');
		await creatorPage.getByRole('button', { name: 'Uppdatera recension' }).click();
		await expect(creatorPage.getByText('Ogiltigt namn på baren').first()).toBeVisible();
		await expect(
			creatorPage.getByRole('checkbox', { name: 'Quiz', exact: true })
		).not.toBeChecked();
		await expect(
			creatorPage.getByRole('checkbox', { name: 'Karaoke', exact: true })
		).not.toBeChecked();
		await creatorPage.getByLabel('Barens namn').fill(draftTitle);
		await creatorPage.getByLabel('Öl för en stor stark').selectOption(listedBeerBrand);
		await creatorPage.getByRole('button', { name: 'Uppdatera recension' }).click();
		await creatorPage.waitForURL(`**/${draftSlug}`);
		await expect(creatorPage.getByText(listedBeerBrand, { exact: true })).toBeVisible();
		const editedReview = await bars.findOne({ slug: draftSlug });
		expect(editedReview).toMatchObject({
			attributes: [],
			beerBrand: listedBeerBrand,
			image: draftImage
		});
		expect(editedReview?.changeLog?.at(-1)).toMatchObject({
			changes: expect.arrayContaining([
				expect.objectContaining({
					field: 'beerBrand',
					before: customBeerBrand,
					after: listedBeerBrand
				})
			])
		});

		const privateImageResponse = await creatorPage.evaluate(async (imagePath) => {
			const response = await fetch(imagePath);
			return {
				status: response.status,
				cacheControl: response.headers.get('cache-control')
			};
		}, `/images/${draftImage}`);
		expect(privateImageResponse.status).toBe(200);
		expect(privateImageResponse.cacheControl).toBe('private, no-store');

		const anonymousContext = await browser.newContext();
		const anonymousPage = await anonymousContext.newPage();
		await anonymousPage.goto(`/?search=${encodeURIComponent(draftTitle)}`);
		await expect(anonymousPage.getByRole('heading', { name: draftTitle })).toHaveCount(0);
		await anonymousPage.goto('/statistik');
		await expect(
			anonymousPage.getByRole('heading', { name: 'Statistik för nästa barrunda.' })
		).toBeVisible();
		await expect(anonymousPage.getByRole('link', { name: draftTitle })).toHaveCount(0);
		for (const path of [`/${draftSlug}`, `/${draftSlug}/history`]) {
			const response = await anonymousPage.goto(path);
			expect(response?.status()).toBe(404);
			await expect(
				anonymousPage.getByRole('heading', {
					level: 1,
					name: '419 Baren är inte recenserad',
					exact: true
				})
			).toBeVisible();
			const html = await response?.text();
			expect(html).not.toContain(draftTitle);
			expect(html).not.toContain(createdReview?.description);
			expect(html).not.toContain(draftImage);
		}
		await expectAnonymousNotFound(anonymousContext, `/images/${draftImage}`);

		await anonymousPage.goto(`/${draftSlug}/edit`);
		await expect(anonymousPage).toHaveURL(/\/login$/);

		const deniedPublish = await anonymousContext.request.post(`/${draftSlug}?/publish`, {
			headers: {
				origin: new URL(anonymousPage.url()).origin
			},
			form: {
				id: createdReview?._id.toString() ?? '',
				publicationStatus: 'published'
			}
		});
		expect(deniedPublish.status()).toBe(200);
		expect(await deniedPublish.json()).toMatchObject({
			type: 'failure',
			status: 401
		});
		expect((await bars.findOne({ slug: draftSlug }))?.publicationStatus).toBe('draft');

		const publisherContext = await browser.newContext();
		const publisherPage = await publisherContext.newPage();
		await login(publisherPage, publisherUsername, publisherPassword);
		await publisherPage.goto(`/${draftSlug}`);

		const decoy = await bars.findOne({ slug: decoySlug });
		await publisherPage.locator('form[action="?/publish"]').evaluate((form, decoyId) => {
			for (const [name, value] of [
				['id', decoyId],
				['publicationStatus', 'published']
			]) {
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = name;
				input.value = value;
				form.append(input);
			}
		}, decoy?._id.toString() ?? '');
		await publisherPage.getByRole('button', { name: 'Publicera recension' }).click();
		await publisherPage.waitForURL(`**/${draftSlug}`);

		const publishedReview = await bars.findOne({ slug: draftSlug });
		expect(publishedReview).toMatchObject({
			publicationStatus: 'published',
			author: 'test',
			coAuthors: []
		});
		expect(publishedReview?.changeLog?.at(-1)).toMatchObject({
			updatedBy: publisherUsername,
			changes: expect.arrayContaining([
				expect.objectContaining({
					field: 'publicationStatus',
					before: 'Utkast',
					after: 'Publicerad'
				})
			])
		});
		expect(publishedReview?.changeLog?.at(-1).changes).toHaveLength(1);
		expect((await bars.findOne({ slug: decoySlug }))?.publicationStatus).toBe('draft');
		expect((await bars.findOne({ slug: legacySlug }))?.publicationStatus).toBeUndefined();
		expect(
			await auditLogs.countDocuments({
				eventType: 'review_publish',
				outcome: 'success',
				username: publisherUsername,
				targetSlug: draftSlug
			})
		).toBe(1);

		await expect(
			publisherPage.locator('[data-publication-status="published"]').first()
		).toContainText('Publicerad');

		await anonymousPage.goto(`/?search=${encodeURIComponent(draftTitle)}`);
		await expect(anonymousPage.getByRole('heading', { name: draftTitle })).toBeVisible();
		await anonymousPage.goto('/statistik');
		await expect(anonymousPage.getByRole('link', { name: draftTitle })).toBeVisible();
		expect((await anonymousContext.request.get(`/${draftSlug}`)).status()).toBe(200);
		expect((await anonymousContext.request.get(`/${draftSlug}/history`)).status()).toBe(200);
		const publicImageResponse = await anonymousContext.request.get(`/images/${draftImage}`);
		expect(publicImageResponse.status()).toBe(200);
		expect(publicImageResponse.headers()['cache-control']).toBe(
			'public, max-age=31536000, immutable'
		);

		await creatorContext.close();
		await publisherContext.close();
		await anonymousContext.close();
	});
});
