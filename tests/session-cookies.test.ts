import { expect } from '@playwright/test';
import { login } from './fixtures/browser';
import {
	isolatedQuota,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	sessions,
	test
} from './fixtures/reviews';

// Exercise native cookie transport without background client preloads renewing first.
test.use({ javaScriptEnabled: false });

test('renews secure web cookies and clears a revoked session after API logout', async ({
	page
}) => {
	await isolatedQuota(loginRateLimits, () => login(page, publisherUsername, publisherPassword));
	const cookie = (await page.context().cookies()).find((item) => item.name === 'auth_session');
	if (!cookie) throw new Error('Inloggningen skapade ingen sessionscookie.');
	expect({ path: cookie.path, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite }).toEqual({
		path: '/',
		httpOnly: true,
		sameSite: 'Lax'
	});
	// The managed preview is a production build; development deliberately permits HTTP cookies.
	if (!process.env.PLAYWRIGHT_TEST_BASE_URL) expect(cookie.secure).toBe(true);

	const previousExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
	const update = await sessions.updateOne(
		{ _id: cookie.value },
		{ $set: { expires_at: previousExpiry } }
	);
	expect(update.matchedCount).toBe(1);
	const renewed = await page.reload();
	// Playwright's headers() hides security headers; allHeaders() includes Set-Cookie.
	const cookieAttributes = (await renewed?.allHeaders())?.['set-cookie']
		?.split(';')
		.slice(1)
		.join(';');
	expect(cookieAttributes).toContain('HttpOnly');
	expect(cookieAttributes).toContain('SameSite=Lax');
	expect(cookieAttributes).toContain('Path=/');
	if (!process.env.PLAYWRIGHT_TEST_BASE_URL) expect(cookieAttributes).toContain('Secure');
	const session = await sessions.findOne({ _id: cookie.value });
	expect(session?.expires_at.getTime()).toBeGreaterThan(previousExpiry.getTime());
	await expect(page).toHaveURL(/\/admin\/reviews$/);

	const logout = await page.request.delete('/api/v1/sessions/current', {
		headers: { authorization: `Bearer ${cookie.value}` }
	});
	expect(logout.status()).toBe(204);
	expect(logout.headers()['set-cookie']).toBeUndefined();
	expect(await sessions.countDocuments({ _id: cookie.value })).toBe(0);
	await page.goto('/admin/reviews');
	await expect(page).toHaveURL(/\/login$/);
	expect(
		(await page.context().cookies()).filter((item) => item.name === 'auth_session')
	).toHaveLength(0);
});
