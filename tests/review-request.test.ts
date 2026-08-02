import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

const localRateLimitIds = [
	['global', 'discord-delivery'],
	['ip', '127.0.0.1'],
	['ip', '::ffff:127.0.0.1'],
	['ip', '::1'],
	['ip', 'unknown']
].map(([scope, key]) => `${scope}:${createHash('sha256').update(key).digest('hex')}`);

const clearLocalTestRateLimits = async () => {
	if (process.env.PLAYWRIGHT_TEST_BASE_URL || !process.env.MONGO_URI) return;

	const client = new MongoClient(process.env.MONGO_URI);
	try {
		await client.connect();
		await client
			.db('enstorstark')
			.collection<{ _id: string }>('review_request_rate_limits')
			.deleteMany({ _id: { $in: localRateLimitIds } });
	} finally {
		await client.close();
	}
};

test.describe('review request form', () => {
	test.use({ viewport: { width: 375, height: 812 } });
	test.beforeAll(clearLocalTestRateLimits);
	test.afterAll(clearLocalTestRateLimits);

	test('is accessible and mobile-first', async ({ page }) => {
		const baseUrl = String(test.info().project.use.baseURL ?? 'http://127.0.0.1:4173');
		await page
			.context()
			.addCookies([{ name: 'analytics_consent', value: 'denied', url: new URL(baseUrl).origin }]);
		await page.goto('/about');

		const form = page.getByTestId('review-request-form');
		const barName = page.getByLabel('Barens namn');
		const location = page.getByLabel('Ort eller adress');
		const motivation = page.getByLabel('Varför borde vi recensera stället?');
		const submit = page.getByRole('button', { name: 'Skicka önskemål' });

		await expect(form).toBeVisible();
		await expect(barName).toHaveAttribute('required', '');
		await expect(location).toHaveAttribute('required', '');
		await expect(motivation).toHaveAttribute('maxlength', '1000');

		const formBox = await form.boundingBox();
		const inputFontSize = await barName.evaluate((element) => getComputedStyle(element).fontSize);
		const submitBox = await submit.boundingBox();
		expect(formBox?.width).toBeLessThanOrEqual(343);
		expect(inputFontSize).toBe('16px');
		expect(submitBox?.height).toBeGreaterThanOrEqual(44);
		expect(submitBox?.width).toBe(formBox?.width);

		await barName.focus();
		await page.keyboard.press('Tab');
		await expect(location).toBeFocused();
	});

	test('delivers through the local mock and resets after success', async ({ page }) => {
		test.skip(
			Boolean(process.env.PLAYWRIGHT_TEST_BASE_URL),
			'Delivery tests never submit against an external deployment.'
		);
		const baseUrl = String(test.info().project.use.baseURL ?? 'http://127.0.0.1:4173');
		await page
			.context()
			.addCookies([{ name: 'analytics_consent', value: 'denied', url: new URL(baseUrl).origin }]);
		await page.goto('/about');

		const barName = page.getByLabel('Barens namn');
		const location = page.getByLabel('Ort eller adress');
		const motivation = page.getByLabel('Varför borde vi recensera stället?');
		const submit = page.getByRole('button', { name: 'Skicka önskemål' });

		await barName.fill('Bar Himmel');
		await location.fill('Andra Långgatan 10, Göteborg');
		await motivation.fill('Bra stämning och rimliga priser.');
		await submit.evaluate((button: HTMLButtonElement) => button.click());

		await expect(page.getByRole('button', { name: 'Skickar…' })).toBeDisabled();
		await expect(page.getByTestId('review-request-status')).toHaveText(
			'Tack! Ditt önskemål har skickats.'
		);
		await expect(barName).toHaveValue('');
		await expect(location).toHaveValue('');
		await expect(motivation).toHaveValue('');
	});
});
