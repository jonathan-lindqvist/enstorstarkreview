import { expect, type Page } from '@playwright/test';
import { ObjectId } from 'mongodb';
import { login } from './fixtures/browser';
import {
	auditLogs,
	bars,
	decoySlug,
	legacySlug,
	legacyTitle,
	publisherPassword,
	publisherUsername,
	runId,
	shortTitle,
	test
} from './fixtures/reviews';

const parseFeed = (page: Page, xml: string) =>
	page.evaluate((source) => {
		const document = new DOMParser().parseFromString(source, 'application/xml');
		return {
			errors: document.querySelectorAll('parsererror').length,
			version: document.documentElement.getAttribute('version'),
			title: document.querySelector('channel > title')?.textContent,
			language: document.querySelector('channel > language')?.textContent,
			items: Array.from(document.querySelectorAll('item')).map((item) => ({
				title: item.querySelector('title')?.textContent,
				link: item.querySelector('link')?.textContent,
				description: item.querySelector('description')?.textContent,
				guid: item.querySelector('guid')?.textContent,
				isPermaLink: item.querySelector('guid')?.getAttribute('isPermaLink'),
				pubDate: item.querySelector('pubDate')?.textContent
			}))
		};
	}, xml);

// Chromium sends secure session cookies on loopback HTTP; Playwright's API client does not.
const fetchFeedInBrowser = (page: Page) =>
	page.evaluate(async () => {
		const response = await fetch('/feed.xml', { cache: 'no-store' });
		return {
			status: response.status,
			xml: await response.text(),
			etag: response.headers.get('etag')
		};
	});

for (const signedIn of [false, true]) {
	test(`opens the RSS link as a document and preserves ${signedIn ? 'signed-in' : 'anonymous'} navigation`, async ({
		page
	}) => {
		if (signedIn) await login(page, publisherUsername, publisherPassword);
		await page.goto('/');
		// Wait for working client interaction rather than clicking the SSR page before hydration.
		await expect
			.poll(async () => {
				await page.getByLabel('Sortera').selectOption('oldest');
				return new URL(page.url()).searchParams.get('sort');
			})
			.toBe('oldest');
		const createLink = page
			.getByRole('navigation')
			.getByRole('link', { name: 'Skapa utkast', exact: true });
		// Prove the client router is active before testing the non-page RSS link.
		await page.evaluate(() => {
			(window as typeof window & { rssNavigationSentinel?: boolean }).rssNavigationSentinel = true;
		});
		await page.getByRole('link', { name: 'FAQ', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Vanliga frågor', exact: true })).toBeVisible();
		expect(
			await page.evaluate(
				() => (window as typeof window & { rssNavigationSentinel?: boolean }).rssNavigationSentinel
			)
		).toBe(true);
		if (signedIn) await expect(createLink).toBeVisible();

		const [request, response] = await Promise.all([
			page.waitForRequest((request) => new URL(request.url()).pathname.startsWith('/feed.xml')),
			page.waitForResponse((response) => new URL(response.url()).pathname.startsWith('/feed.xml')),
			page.getByRole('link', { name: 'RSS-flöde', exact: true }).click()
		]);
		expect(new URL(request.url()).pathname).toBe('/feed.xml');
		expect(request.isNavigationRequest()).toBe(true);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toBe('application/rss+xml; charset=utf-8');
		await expect(
			page.getByRole('heading', { name: '419 Baren är inte recenserad', exact: true })
		).toHaveCount(0);

		await page.goto('/about');
		await expect(createLink).toHaveCount(signedIn ? 1 : 0);
		if (signedIn) {
			const admin = await page.goto('/admin/reviews');
			expect(admin?.status()).toBe(200);
			await expect(createLink).toBeVisible();
		}
	});
}

test('offers a public RSS feed, HTTP validators, and Swedish discovery links', async ({
	page,
	browser
}) => {
	await page.goto('/about');
	await expect(
		page.getByRole('heading', { name: 'Hur följer jag nya recensioner?' })
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'RSS-flöde', exact: true })).toHaveAttribute(
		'href',
		'/feed.xml'
	);
	await expect(
		page.locator('head link[rel="alternate"][type="application/rss+xml"]')
	).toHaveAttribute('href', '/feed.xml');
	await expect(
		page.getByText('Din RSS-läsare styr hur ofta nya recensioner hämtas.', { exact: false })
	).toBeVisible();

	const response = await page.request.get('/feed.xml');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('application/rss+xml; charset=utf-8');
	expect(response.headers()['cache-control']).toBe('public, max-age=300');
	const etag = response.headers().etag;
	expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
	const xml = await response.text();
	const feed = await parseFeed(page, xml);
	expect(feed).toMatchObject({
		errors: 0,
		version: '2.0',
		title: 'En Stor Stark Review',
		language: 'sv-SE'
	});
	expect(feed.items.length).toBeLessThanOrEqual(50);
	expect(feed.items.map((item) => item.title)).toEqual(
		expect.arrayContaining([legacyTitle, shortTitle])
	);
	const legacy = await bars.findOne({ slug: legacySlug });
	expect(feed.items.find((item) => item.title === legacyTitle)).toMatchObject({
		link: new URL(`/${legacySlug}`, response.url()).href,
		guid: `enstorstarkreview:review:${legacy!._id}`,
		isPermaLink: 'false',
		pubDate: legacy!.createdAt.toUTCString()
	});

	for (const validator of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
		const unchanged = await page.request.get('/feed.xml', {
			headers: { 'if-none-match': validator }
		});
		expect(unchanged.status()).toBe(304);
		expect(unchanged.headers().etag).toBe(etag);
		expect(unchanged.headers()['cache-control']).toBe('public, max-age=300');
		expect(await unchanged.text()).toBe('');
	}
	const changed = await page.request.get('/feed.xml', {
		headers: { 'if-none-match': '"outdated"' }
	});
	expect(changed.status()).toBe(200);

	const signedIn = await browser.newContext();
	try {
		const editorPage = await signedIn.newPage();
		await login(editorPage, publisherUsername, publisherPassword);
		const editorFeed = await fetchFeedInBrowser(editorPage);
		expect(editorFeed.status).toBe(200);
		expect(editorFeed.xml).toBe(xml);
		expect(editorFeed.etag).toBe(etag);
		await expect(
			editorPage.locator('head link[rel="alternate"][type="application/rss+xml"]')
		).toHaveAttribute('href', '/feed.xml');
	} finally {
		await signedIn.close();
	}
});

test('excludes private and unknown statuses, adds publications, and preserves entry identity after edits', async ({
	page,
	browser
}) => {
	test.setTimeout(60_000);
	await page.goto('/about');
	const before = await page.request.get('/feed.xml');
	const original = await bars.findOne({ slug: decoySlug });
	const draftId = new ObjectId();
	const unknownId = new ObjectId();
	const slug = `rss-publication-${runId}`;
	const editedSlug = `${slug}-edited`;
	const title = `Öl & <baren> "åäö" ${runId}`;
	const location = '<img src=x onerror=alert(1)> & Ölgatan 1';
	const createdAt = new Date('2000-01-01T00:00:00Z');
	const signedIn = await browser.newContext();
	try {
		await bars.insertMany([
			{
				...original,
				_id: draftId,
				slug,
				title,
				location,
				createdAt,
				publicationStatus: 'draft',
				changeLog: []
			},
			{
				...original,
				_id: unknownId,
				slug: `${slug}-unknown`,
				title: 'Unknown status',
				createdAt: new Date('2099-01-01'),
				publicationStatus: 'pending'
			}
		]);
		const editorPage = await signedIn.newPage();
		await login(editorPage, publisherUsername, publisherPassword);
		for (const visitorPage of [page, editorPage]) {
			const privateFeed = await fetchFeedInBrowser(visitorPage);
			expect(privateFeed.status).toBe(200);
			expect(privateFeed.etag).toBe(before.headers().etag);
			expect(privateFeed.xml).not.toContain(draftId.toHexString());
			expect(privateFeed.xml).not.toContain(unknownId.toHexString());
		}

		await editorPage.goto(`/${slug}`);
		await editorPage.getByRole('button', { name: 'Publicera recension' }).click();
		await expect(editorPage.getByText('Privat utkast', { exact: true })).toHaveCount(0);
		const published = await bars.findOne({ _id: draftId });
		expect(published?.publicationStatus).toBe('published');
		const publicationDate = published!.changeLog.at(-1).updatedAt as Date;
		const response = await page.request.get('/feed.xml', {
			headers: { 'if-none-match': before.headers().etag }
		});
		expect(response.status()).toBe(200);
		expect(response.headers().etag).not.toBe(before.headers().etag);
		const feed = await parseFeed(page, await response.text());
		expect(feed.errors).toBe(0);
		const guid = `enstorstarkreview:review:${draftId}`;
		const entry = feed.items.find((item) => item.guid === guid);
		expect(entry).toMatchObject({
			title,
			link: new URL(`/${slug}`, response.url()).href,
			description: '&lt;img src=x onerror=alert(1)&gt; &amp; Ölgatan 1. Helhetsbetyg: 2/3.',
			pubDate: publicationDate.toUTCString()
		});
		expect(entry?.pubDate).not.toBe(createdAt.toUTCString());
		expect(feed.items.filter((item) => item.guid === guid)).toHaveLength(1);
		expect(feed.items.some((item) => item.guid?.endsWith(unknownId.toHexString()))).toBe(false);

		await bars.updateOne(
			{ _id: draftId },
			{
				$set: {
					slug: editedSlug,
					title: 'Nytt namn',
					rating: 3,
					updatedAt: new Date(),
					changeLog: [
						...published!.changeLog,
						{
							updatedAt: new Date(),
							updatedBy: publisherUsername,
							changes: [{ field: 'title', label: 'Barens namn', before: title, after: 'Nytt namn' }]
						}
					]
				}
			}
		);
		const editedResponse = await page.request.get('/feed.xml', {
			headers: { 'if-none-match': response.headers().etag }
		});
		expect(editedResponse.status()).toBe(200);
		expect(editedResponse.headers().etag).not.toBe(response.headers().etag);
		const editedFeed = await parseFeed(page, await editedResponse.text());
		expect(editedFeed.errors).toBe(0);
		expect(editedFeed.items.map((item) => item.guid)).toEqual(feed.items.map((item) => item.guid));
		expect(editedFeed.items.find((item) => item.guid === guid)).toMatchObject({
			title: 'Nytt namn',
			link: new URL(`/${editedSlug}`, response.url()).href,
			pubDate: entry?.pubDate,
			description: '&lt;img src=x onerror=alert(1)&gt; &amp; Ölgatan 1. Helhetsbetyg: 3/3.'
		});
	} finally {
		await bars.deleteMany({ _id: { $in: [draftId, unknownId] } });
		await auditLogs.deleteMany({ targetSlug: slug });
		await signedIn.close();
	}
});
