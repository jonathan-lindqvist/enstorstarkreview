import { describe, expect, it } from 'vitest';
import {
	getSeoMetadata,
	publicReviewListSchema,
	serializeJsonLd,
	jsonLdScript,
	siteUrl
} from './seo';
import type { SerializedBarReview } from './types/bar-review';

const bar = {
	title: 'Baren',
	slug: 'baren',
	description: '**Gott** öl och en trevlig kväll.',
	location: 'Göteborg',
	image: '0123456789abcdef01234567.png',
	rating: 0,
	author: 'Anna',
	coAuthors: ['Bo'],
	publicationStatus: 'published'
} as SerializedBarReview;
const url = (path: string) => new URL(path, 'https://untrusted.example');

describe('server-rendered SEO metadata', () => {
	it('uses the trusted origin and a distinct canonical for each unfiltered batch', () => {
		const seo = getSeoMetadata(url('/?page=2&utm_source=anything'), { bars: [bar] });
		expect(seo.canonical).toBe('https://enstorstarkreview.se/?page=2');
		expect(seo.title).toContain('sida 2');
		expect(seo.noindex).toBe(false);
		expect(publicReviewListSchema([bar], 2)).toMatchObject({ itemListElement: [{ position: 25 }] });
		expect(getSeoMetadata(url('/?page=1'), {}).canonical).toBe('https://enstorstarkreview.se/');
	});
	it.each([
		'/?search=baren',
		'/?sort=nearest',
		'/?sort=score',
		'/?attributes=quiz',
		'/karta?attributes=quiz',
		'/login',
		'/installningar',
		'/admin/reviews',
		'/baren/edit',
		'/baren/history'
	])('excludes utility or alternative listing %s', (path) => {
		expect(getSeoMetadata(url(path), {}).noindex).toBe(true);
	});
	it.each(['/', '/about', '/karta', '/statistik'])('describes public page %s', (path) => {
		const seo = getSeoMetadata(url(path), {});
		expect(seo.title).toContain('En Stor Stark Review');
		expect(seo.description.length).toBeGreaterThan(30);
		expect(seo.noindex).toBe(false);
	});
	it('describes only the displayed review and the actual rating scale', () => {
		const seo = getSeoMetadata(url('/baren'), { bar, publishedAt: '2026-01-01T12:00:00.000Z' });
		expect(seo.canonical).toBe('https://enstorstarkreview.se/baren');
		expect(seo.description).not.toContain('**');
		expect(seo.image).toContain('preview=detail-v1');
		expect(seo.structuredData[0]).toMatchObject({
			'@type': 'Review',
			author: [{ name: 'Anna' }, { name: 'Bo' }],
			reviewRating: { ratingValue: 0, worstRating: 0, bestRating: 3 },
			datePublished: '2026-01-01T12:00:00.000Z'
		});
	});
	it('excludes drafts, unknown statuses and errors from structured metadata', () => {
		for (const status of ['draft', 'unknown']) {
			const privateBar = { ...bar, publicationStatus: status } as SerializedBarReview;
			const seo = getSeoMetadata(url('/baren'), { bar: privateBar });
			expect(seo.noindex).toBe(true);
			expect(seo.structuredData).toEqual([]);
			expect(seo.description).not.toContain(bar.description);
		}
		expect(getSeoMetadata(url('/missing'), {}, 404)).toMatchObject({ noindex: true });
		expect(getSeoMetadata(url('/'), {}, 503).title).toContain('Något gick fel');
		expect(getSeoMetadata(url('/baren/history'), { bar }).noindex).toBe(true);
		expect(getSeoMetadata(url('/baren'), { bar }, 404).structuredData).toEqual([]);
	});
	it('omits invalid ratings, uses a safe fallback image and excludes private list entries', () => {
		const seo = getSeoMetadata(url('/baren'), {
			bar: { ...bar, rating: NaN, image: 'blob:private', coAuthors: undefined }
		});
		expect(seo.image).toContain('logo-social.png');
		expect(seo.structuredData[0].reviewRating).toBeUndefined();
		const list = publicReviewListSchema([{ ...bar, publicationStatus: 'draft' }, bar], 1);
		expect(list).toMatchObject({ itemListElement: [{ name: 'Baren' }] });
	});
	it('escapes script delimiters while preserving JSON content', () => {
		const value = { text: '</script><script>alert("x")</script>&\u2028\u2029' };
		const encoded = serializeJsonLd(value);
		expect(encoded).not.toContain('<');
		expect(JSON.parse(encoded)).toEqual(value);
		expect(jsonLdScript(value)).toBe(`<script type="application/ld+json">${encoded}</script>`);
		expect(siteUrl('//evil.example')).toBe('https://enstorstarkreview.se//evil.example');
	});
	it('matches visible legacy author credits', () => {
		const seo = getSeoMetadata(url('/baren'), {
			bar: { ...bar, coAuthors: 'Bo' as unknown as string[] }
		});
		expect(seo.structuredData[0].author).toEqual([
			{ '@type': 'Person', name: 'Anna' },
			{ '@type': 'Person', name: 'Bo' }
		]);
	});
});
