import { chromium, firefox, expect, test } from '@playwright/test';

for (const browserName of ['chromium', 'firefox'] as const) {
	test.describe(`SEO and CSP in ${browserName}`, () => {
		for (const consent of ['unset', 'denied', 'granted']) {
			test(`hydrates and navigates with matching nonces when consent is ${consent}`, async ({
				baseURL
			}) => {
				const browser = await { chromium, firefox }[browserName].launch();
				try {
					const context = await browser.newContext({
						baseURL,
						viewport: { width: 1280, height: 844 }
					});
					const page = await context.newPage();
					await page.route('https://www.googletagmanager.com/**', (route) =>
						route.fulfill({
							contentType: 'application/javascript',
							body: 'window.testGoogleLoaded = true;'
						})
					);
					if (consent !== 'unset')
						await page
							.context()
							.addCookies([{ name: 'analytics_consent', value: consent, url: baseURL! }]);
					await page.addInitScript(() => {
						(window as unknown as { cspViolations: string[] }).cspViolations = [];
						document.addEventListener('securitypolicyviolation', (event) => {
							(window as unknown as { cspViolations: string[] }).cspViolations.push(
								event.effectiveDirective
							);
						});
					});
					const response = await page.goto('/');
					const csp = response!.headers()['content-security-policy'];
					expect(csp).toContain("script-src 'self'");
					const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
					expect(nonce).toBeTruthy();
					const nonces = await page
						.locator('script:not([src]):not([type="application/ld+json"])')
						.evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
					expect(nonces.every((value) => value === nonce)).toBe(true);
					await expect
						.poll(() =>
							page.evaluate(() =>
								Boolean((window as unknown as { testGoogleLoaded: boolean }).testGoogleLoaded)
							)
						)
						.toBe(true);
					await page.getByRole('link', { name: 'FAQ', exact: true }).click();
					await expect(page).toHaveURL('/about');
					await page.getByRole('link', { name: 'Inställningar', exact: true }).first().click();
					await expect(page).toHaveURL('/installningar');
					expect(
						await page.evaluate(
							() => (window as unknown as { cspViolations: string[] }).cspViolations
						)
					).toEqual([]);
					const second = await page.request.get('/');
					expect(
						second.headers()['content-security-policy'].match(/'nonce-([^']+)'/)?.[1]
					).not.toBe(nonce);
				} finally {
					await browser.close();
				}
			});
		}
	});
}
