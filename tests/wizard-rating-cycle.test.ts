import { expect, firefox, type Page } from '@playwright/test';
import { login, nextWizardStep, rateEveryAspect } from './fixtures/browser';
import {
	fixtureImagePath,
	isolatedQuota,
	listedBeerBrand,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	test
} from './fixtures/reviews';

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
test.setTimeout(60_000);

test.beforeEach(async ({ page, baseURL }) => {
	await page.context().addCookies([
		{ name: 'analytics_consent', value: 'denied', url: baseURL! },
		{ name: 'location_enabled', value: 'false', url: baseURL! }
	]);
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
});

const walkToRating = async (page: Page, aspect = 3) => {
	await page.goto('/admin/reviews/create/wizard', { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('list', { name: 'Steg', exact: true })).toBeVisible();
	await page.locator('#image').setInputFiles(fixtureImagePath);
	await nextWizardStep(page);
	await page.getByRole('textbox', { name: 'Barens namn' }).fill(`Stämpelcykel ${aspect} ${runId}`);
	await page.getByLabel('Adress').fill('Stämpelgatan 1');
	await nextWizardStep(page);
	await page.getByLabel('Pris för en stor stark').fill('65');
	await page.getByRole('radio', { name: listedBeerBrand, exact: true }).check();
	await nextWizardStep(page);
	await rateEveryAspect(page, aspect);
};

const expectRating = async (page: Page, rating: number) => {
	const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
	await expect(page.locator('input[name="rating"]')).toHaveValue(String(rating));
	await expect(button).toHaveAccessibleName(
		`Helhetsbetyg ${rating} av 3. Ändra till ${(rating + 1) % 4} av 3.`
	);
	if (rating === 0) {
		await expect(button.locator('img:visible')).toHaveCount(0);
		await expect(button).toHaveText('Ingen stämpel');
	} else {
		const image = button.locator('img:visible');
		await expect(image).toHaveAttribute('src', `/rating-glass/${rating}.png`);
		await expect(image).toHaveAttribute('draggable', 'false');
		await expect
			.poll(() =>
				image.evaluate(
					(image: HTMLImageElement, value: number) =>
						image.complete &&
						image.naturalWidth > 0 &&
						image.currentSrc.endsWith(`/rating-glass/${value}.png`),
					rating
				)
			)
			.toBe(true);
	}
};

test('waits for decoded mugs before allowing phone taps to change the selection', async ({
	page
}) => {
	let release!: () => void;
	const ready = new Promise<void>((resolve) => (release = resolve));
	const requested = new Set<string>();
	await page.route('**/rating-glass/*.png', async (route) => {
		requested.add(new URL(route.request().url()).pathname);
		await ready;
		await route.continue();
	});
	try {
		await walkToRating(page);
		const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
		await expect(button).toBeDisabled();
		await expect(page.getByRole('status').filter({ hasText: 'Laddar stämplar…' })).toBeVisible();
		await button.evaluate((button: HTMLButtonElement) => button.click());
		await expect(page.locator('input[name="rating"]')).toHaveValue('1');
		await expect
			.poll(() => [...requested].sort())
			.toEqual(['/rating-glass/1.png', '/rating-glass/2.png', '/rating-glass/3.png']);
		release();
		await expect(button).toBeEnabled();
		for (let index = 0; index < 12; index++) {
			await button.tap();
			await expectRating(page, (index + 2) % 4);
		}
	} finally {
		release();
	}
});

test('retries failed mug loading without changing the selected rating', async ({ page }) => {
	let fail = true;
	await page.route('**/rating-glass/2.png', (route) => (fail ? route.abort() : route.continue()));
	await walkToRating(page);
	const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
	await expect(
		page.getByRole('alert').filter({ hasText: 'Stämplarna kunde inte laddas.' })
	).toBeVisible();
	await expect(button).toBeDisabled();
	await expect(page.locator('input[name="rating"]')).toHaveValue('1');
	fail = false;
	await page.getByRole('button', { name: 'Försök igen', exact: true }).tap();
	await expect(button).toBeEnabled();
	await expectRating(page, 1);
	await button.tap();
	await expectRating(page, 2);
});

test('keeps decoded artwork in sync when the browser cannot cache mug responses', async ({
	page
}, testInfo) => {
	let holdRequests = false;
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/rating-glass/*.png', async (route) => {
		if (holdRequests) await released;
		const response = await route.fetch();
		await route.fulfill({
			response,
			headers: { ...response.headers(), 'cache-control': 'no-store' }
		});
	});
	try {
		await walkToRating(page);
		const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
		await expect(button).toBeEnabled();
		await expectRating(page, 1);
		holdRequests = true;
		for (let index = 0; index < 12; index++) {
			await button.tap();
			await expectRating(page, (index + 2) % 4);
			if (index < 4) {
				await button.screenshot({ path: testInfo.outputPath(`uncached-${(index + 2) % 4}.png`) });
			}
		}
	} finally {
		release();
		await page.unrouteAll({ behavior: 'wait' });
	}
});

for (const [aspect, initial] of [
	[0, 0],
	[3, 1],
	[4, 2],
	[5, 3]
]) {
	test(`cycles decoded mugs consistently from suggestion ${initial} with touch, mouse and keyboard`, async ({
		page
	}) => {
		await walkToRating(page, aspect);
		const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
		await expect(button).toBeEnabled();
		await expectRating(page, initial);
		await button.scrollIntoViewIfNeeded();
		const bounds = (await button.boundingBox())!;
		for (const input of ['slow touch', 'rapid touch', 'mouse', 'Enter', 'Space']) {
			for (let index = 0; index < 12; index++) {
				if (input === 'slow touch') {
					await button.tap();
					await page.waitForTimeout(150);
				} else if (input === 'rapid touch') {
					await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
				} else if (input === 'mouse') {
					await button.click();
				} else {
					await button.press(input);
				}
				await expectRating(page, (initial + index + 1) % 4);
				expect((await button.boundingBox())!.width).toBe(bounds.width);
				expect((await button.boundingBox())!.height).toBe(bounds.height);
			}
		}
		await button.tap();
		await page.getByRole('button', { name: 'Använd förslaget' }).tap();
		await expectRating(page, initial);
		await button.tap();
		await page.getByRole('button', { name: 'Steg 2 av 6, Bar' }).tap();
		await page.getByRole('button', { name: 'Steg 5 av 6, Helhet & text' }).tap();
		await expectRating(page, (initial + 1) % 4);
	});
}

test.describe('Firefox', () => {
	for (const [aspect, initial] of [
		[0, 0],
		[3, 1],
		[4, 2],
		[5, 3]
	]) {
		test(`cycles the rendered mug from suggestion ${initial}`, async ({
			page: signedInPage,
			baseURL
		}, testInfo) => {
			const browser = await firefox.launch();
			try {
				const context = await browser.newContext({
					baseURL,
					viewport: { width: 375, height: 812 },
					isMobile: false,
					hasTouch: false
				});
				await context.addCookies(await signedInPage.context().cookies());
				const page = await context.newPage();
				await test.step('Open the Firefox wizard', () => walkToRating(page, aspect));
				const button = page.getByRole('button', { name: /^Helhetsbetyg \d av 3\. Ändra till/ });
				await expect(button).toBeEnabled();
				await expectRating(page, initial);
				await button.evaluate((button) => button.scrollIntoView({ block: 'center' }));
				await test.step('Advance once for a duplicated pointer click', async () => {
					await button.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
					await button.dispatchEvent('click', { detail: 2 });
					await button.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
					await button.dispatchEvent('click', { detail: 1 });
					await expectRating(page, (initial + 1) % 4);
					await button.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
					await button.dispatchEvent('pointercancel', { pointerType: 'touch', isPrimary: true });
					await button.dispatchEvent('click', { detail: 1 });
					await expectRating(page, (initial + 1) % 4);
					await page.getByRole('button', { name: 'Använd förslaget' }).click();
					await expectRating(page, initial);
				});
				for (const input of ['mouse', 'Enter', 'Space']) {
					await test.step(`Cycle with ${input}`, async () => {
						for (let index = 0; index < 12; index++) {
							if (input === 'mouse') await button.click();
							else await button.press(input);
							await expectRating(page, (initial + index + 1) % 4);
							if (input === 'mouse' && index < 4) {
								await button.screenshot({
									path: testInfo.outputPath(`firefox-${(initial + index + 1) % 4}.png`)
								});
							}
						}
					});
				}
			} finally {
				await test.step('Close Firefox', () => browser.close());
			}
		});
	}
});
