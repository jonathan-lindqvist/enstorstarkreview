import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
	buildReviewFeed,
	getReviewPublicationDate,
	loadPublicReviewFeed,
	type ReviewFeedDocument
} from './review-feed';

const origin = 'https://reviews.example';
const createdAt = new Date('2025-01-01T12:00:00Z');
const publishedAt = new Date('2025-02-01T12:00:00Z');

const review = (overrides: Partial<ReviewFeedDocument> = {}): ReviewFeedDocument => ({
	_id: new ObjectId('000000000000000000000001'),
	title: 'Göteborgs bar',
	location: 'Ölgatan 1, Göteborg',
	rating: 2,
	slug: 'göteborgs-bar',
	createdAt,
	...overrides
});

const publication = (updatedAt: Date) => ({
	updatedAt,
	changes: [{ field: 'publicationStatus', before: 'Utkast', after: 'Publicerad' }]
});

describe('review publication dates for RSS', () => {
	it('uses the earliest publication, ignoring later edits and history order', () => {
		const document = review({
			changeLog: [
				publication(new Date('2025-03-01T12:00:00Z')),
				publication(publishedAt),
				{
					updatedAt: new Date('2025-04-01T12:00:00Z'),
					changes: [{ field: 'title', before: 'Bar', after: 'Ny bar' }]
				}
			]
		});
		expect(getReviewPublicationDate(document)).toEqual(publishedAt);
	});

	it('falls back to creation for legacy reviews and ignores other status changes', () => {
		expect(getReviewPublicationDate(review())).toEqual(createdAt);
		expect(getReviewPublicationDate(review({ changeLog: [] }))).toEqual(createdAt);
		expect(
			getReviewPublicationDate(
				review({
					changeLog: [
						{
							updatedAt: publishedAt,
							changes: [{ field: 'publicationStatus', before: 'Publicerad', after: 'Utkast' }]
						}
					]
				})
			)
		).toEqual(createdAt);
	});

	it('excludes invalid dates but uses a valid publication even if creation is invalid', () => {
		const invalid = new Date('invalid');
		expect(getReviewPublicationDate(review({ createdAt: invalid }))).toBeNull();
		expect(getReviewPublicationDate(review({ changeLog: [publication(invalid)] }))).toBeNull();
		expect(
			getReviewPublicationDate(
				review({ createdAt: invalid, changeLog: [publication(invalid), publication(publishedAt)] })
			)
		).toEqual(publishedAt);
	});
});

describe('RSS feed', () => {
	it('produces an empty RSS channel with Swedish metadata and absolute links', () => {
		const xml = buildReviewFeed([], origin);
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(xml).toContain('<rss version="2.0"');
		expect(xml).toContain('<language>sv-SE</language>');
		expect(xml).toContain(`<link>${origin}/</link>`);
		expect(xml).toContain(`href="${origin}/feed.xml"`);
		expect(xml).not.toContain('<item>');
	});

	it('sorts by publication instead of creation date and breaks ties by descending ID', () => {
		const older = review({ title: 'Older' });
		const newer = review({
			_id: new ObjectId('000000000000000000000002'),
			title: 'Newer',
			createdAt: new Date('2020-01-01'),
			changeLog: [publication(publishedAt)]
		});
		const tied = review({
			...newer,
			_id: new ObjectId('000000000000000000000003'),
			title: 'Tied'
		});
		const xml = buildReviewFeed([older, newer, tied], origin);
		expect(xml.indexOf('<title>Tied</title>')).toBeLessThan(xml.indexOf('<title>Newer</title>'));
		expect(xml.indexOf('<title>Newer</title>')).toBeLessThan(xml.indexOf('<title>Older</title>'));
		expect(xml).toContain(`<pubDate>${publishedAt.toUTCString()}</pubDate>`);
	});

	it('keeps the latest 50 valid entries', () => {
		const documents = Array.from({ length: 55 }, (_, index) =>
			review({
				_id: new ObjectId(index.toString(16).padStart(24, '0')),
				title: `Bar ${index}`,
				createdAt: new Date(createdAt.getTime() + index * 1000)
			})
		);
		documents.push(review({ title: 'Invalid', createdAt: new Date('invalid') }));
		const xml = buildReviewFeed(documents, origin);
		expect(xml.match(/<item>/g)).toHaveLength(50);
		expect(xml).toContain('<title>Bar 54</title>');
		expect(xml).toContain('<title>Bar 5</title>');
		expect(xml).not.toContain('<title>Bar 4</title>');
		expect(xml).not.toContain('<title>Invalid</title>');
	});

	it('keeps identity and publication date after title, slug, and history edits', () => {
		const original = review({ changeLog: [publication(publishedAt)] });
		const edited = {
			...original,
			title: 'Nytt namn',
			slug: 'nytt-namn',
			updatedAt: new Date('2025-05-01'),
			changeLog: [
				...original.changeLog!,
				{
					updatedAt: new Date('2025-05-01'),
					changes: [{ field: 'title', before: 'Bar', after: 'Nytt namn' }]
				}
			]
		};
		const before = buildReviewFeed([original], origin);
		const after = buildReviewFeed([edited], origin);
		for (const xml of [before, after]) {
			expect(xml).toContain(
				`<guid isPermaLink="false">enstorstarkreview:review:${original._id}</guid>`
			);
			expect(xml).toContain(`<pubDate>${publishedAt.toUTCString()}</pubDate>`);
			expect(xml.match(/<item>/g)).toHaveLength(1);
		}
		expect(before).toContain(`${origin}/g%C3%B6teborgs-bar`);
		expect(after).toContain(`${origin}/nytt-namn`);
	});

	it('escapes XML, encodes reader-rendered text, and removes invalid XML characters', () => {
		const xml = buildReviewFeed(
			[
				review({
					title: 'Öl & <bar> "åäö" 🍺\u0001\ud800\ufffe',
					location: '<img src=x onerror=alert(1)> & Ölgatan'
				})
			],
			origin
		);
		expect(xml).toContain('<title>Öl &amp; &lt;bar&gt; &quot;åäö&quot; 🍺</title>');
		expect(xml).toContain('&amp;lt;img src=x onerror=alert(1)&amp;gt; &amp;amp; Ölgatan');
		expect(xml).not.toContain('<img');
		expect(xml).not.toContain('\u0001');
		expect(xml).not.toContain('\ud800');
		expect(xml).not.toContain('\ufffe');
	});

	it('queries only public documents and projects only announcement and publication fields', async () => {
		const find = vi.fn().mockReturnValue({ toArray: async () => [review()] });
		await loadPublicReviewFeed({ find }, origin);
		expect(find).toHaveBeenCalledWith(
			{ $or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }] },
			{
				projection: {
					_id: 1,
					title: 1,
					location: 1,
					rating: 1,
					slug: 1,
					createdAt: 1,
					'changeLog.updatedAt': 1,
					'changeLog.changes.field': 1,
					'changeLog.changes.before': 1,
					'changeLog.changes.after': 1
				}
			}
		);
	});
});
