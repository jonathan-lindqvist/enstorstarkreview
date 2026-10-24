import { expect } from '@playwright/test';
import {
	isolatedQuota,
	loginRateLimits,
	publisherUsername,
	reviewRequestRateLimits,
	sessions,
	test
} from './fixtures/reviews';

test('enhanced invalid login returns HTTP 400 without creating a session', async ({ page }) => {
	await isolatedQuota(loginRateLimits, async () => {
		const sessionCount = await sessions.countDocuments({});
		await page.goto('/login');
		await page.getByLabel('Användarnamn').fill(publisherUsername);
		await page.getByLabel('Lösenord', { exact: true }).fill('incorrect-password');
		const submission = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && new URL(response.url()).pathname === '/login'
		);
		await page.getByRole('button', { name: 'Logga in', exact: true }).click();
		const response = await submission;

		await expect(page.getByText('Fel användarnamn eller lösenord', { exact: true })).toBeVisible();
		expect(await sessions.countDocuments({})).toBe(sessionCount);
		expect((await page.context().cookies()).some((cookie) => cookie.name === 'auth_session')).toBe(
			false
		);
		expect(response.status()).toBe(400);
	});
});

test('enhanced login quota failures return HTTP 429 without creating sessions', async ({
	request,
	baseURL
}) => {
	await isolatedQuota(loginRateLimits, async () => {
		const sessionCount = await sessions.countDocuments({});
		for (let attempt = 0; attempt < 9; attempt++) {
			const response = await request.post('/login?/login', {
				headers: {
					origin: new URL(baseURL!).origin,
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				},
				form: { username: publisherUsername, password: 'incorrect-password' }
			});
			expect(response.status()).toBe(attempt < 8 ? 400 : 429);
			expect(await response.json()).toMatchObject({
				type: 'failure',
				status: attempt < 8 ? 400 : 429
			});
			expect(response.headers()['set-cookie']).toBeUndefined();
		}
		expect(await sessions.countDocuments({})).toBe(sessionCount);
	});
});

test('cross-origin login is rejected before quota or session writes', async ({ request }) => {
	const sessionCount = await sessions.countDocuments({});
	const limits = await loginRateLimits.find({}).toArray();
	const response = await request.post('/login?/login', {
		headers: { origin: 'https://untrusted.example', 'x-sveltekit-action': 'true' },
		form: { username: publisherUsername, password: 'incorrect-password' }
	});
	expect(response.status()).toBe(403);
	expect(await loginRateLimits.find({}).toArray()).toEqual(limits);
	expect(await sessions.countDocuments({})).toBe(sessionCount);
	expect(response.headers()['set-cookie']).toBeUndefined();
});

test('enhanced invalid review requests retain their HTTP 400 failure response', async ({
	request,
	baseURL
}) => {
	await isolatedQuota(reviewRequestRateLimits, async () => {
		const response = await request.post('/about?/requestReview', {
			headers: {
				origin: new URL(baseURL!).origin,
				accept: 'application/json',
				'x-sveltekit-action': 'true'
			},
			form: { barName: '', location: '', motivation: '' }
		});
		expect(response.status()).toBe(400);
		expect(await response.json()).toMatchObject({ type: 'failure', status: 400 });
		expect(response.headers()['set-cookie']).toBeUndefined();
	});
});
