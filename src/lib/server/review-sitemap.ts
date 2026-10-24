import type { Collection } from 'mongodb';
import type { BarReview } from '#lib/types/bar-review.js';
import { HOME_REVIEW_PAGE_SIZE } from '#lib/home-reviews.js';
import { siteUrl } from '#lib/seo.js';
import { PUBLIC_REVIEW_FILTER } from './review-publication';
import { stripControlCharacters } from '#lib/utils/review-text.js';

const escapeXml = (text: string): string =>
	stripControlCharacters(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

export const loadPublicReviewSitemap = async (collection: Pick<Collection<BarReview>, 'find'>) => {
	const reviews = await collection
		.find(PUBLIC_REVIEW_FILTER, {
			projection: { slug: 1, updatedAt: 1, createdAt: 1 },
			sort: { slug: 1 }
		})
		.toArray();
	const entries = ['/', '/about', '/karta', '/statistik'].map(
		(path) => `<url><loc>${escapeXml(siteUrl(path))}</loc></url>`
	);
	for (let page = 2; page <= Math.ceil(reviews.length / HOME_REVIEW_PAGE_SIZE); page += 1) {
		entries.push(`<url><loc>${escapeXml(siteUrl(`/?page=${page}`))}</loc></url>`);
	}
	for (const review of reviews) {
		const date = review.updatedAt ?? review.createdAt;
		const lastmod =
			date instanceof Date && Number.isFinite(date.getTime())
				? `<lastmod>${date.toISOString()}</lastmod>`
				: '';
		entries.push(
			`<url><loc>${escapeXml(siteUrl(`/${encodeURIComponent(review.slug)}`))}</loc>${lastmod}</url>`
		);
	}
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
};
