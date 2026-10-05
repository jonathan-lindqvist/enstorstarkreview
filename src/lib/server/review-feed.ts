import type { Filter, FindOptions } from 'mongodb';
import type { BarReview, ReviewFieldChange } from '$lib/types/bar-review';
import { PUBLIC_REVIEW_FILTER } from './review-publication';

export type ReviewFeedDocument = Pick<
	BarReview,
	'_id' | 'title' | 'location' | 'rating' | 'slug' | 'createdAt'
> & {
	changeLog?: {
		updatedAt: Date;
		changes: Pick<ReviewFieldChange, 'field' | 'before' | 'after'>[];
	}[];
};

interface ReviewFeedCollection {
	find(
		filter: Filter<BarReview>,
		options: FindOptions
	): { toArray(): Promise<ReviewFeedDocument[]> };
}

const FEED_LIMIT = 50;
const FEED_PROJECTION = {
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
};

const isValidDate = (value: unknown): value is Date =>
	value instanceof Date && Number.isFinite(value.getTime());

export const getReviewPublicationDate = (review: ReviewFeedDocument): Date | null => {
	const publications = (review.changeLog ?? []).filter((entry) =>
		entry.changes.some(
			(change) =>
				change.field === 'publicationStatus' &&
				change.before === 'Utkast' &&
				change.after === 'Publicerad'
		)
	);

	if (!publications.length) return isValidDate(review.createdAt) ? review.createdAt : null;

	const dates = publications.map((entry) => entry.updatedAt).filter(isValidDate);
	return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
};

const escapeXml = (value: string): string =>
	Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0)!;
			return (
				code === 9 ||
				code === 10 ||
				code === 13 ||
				(code >= 32 && code <= 0xd7ff) ||
				(code >= 0xe000 && code <= 0xfffd) ||
				code >= 0x10000
			);
		})
		.join('')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

export const buildReviewFeed = (reviews: ReviewFeedDocument[], origin: string): string => {
	const entries = reviews
		.map((review) => ({ review, publishedAt: getReviewPublicationDate(review) }))
		.filter((entry): entry is { review: ReviewFeedDocument; publishedAt: Date } =>
			isValidDate(entry.publishedAt)
		)
		.sort(
			(a, b) =>
				b.publishedAt.getTime() - a.publishedAt.getTime() ||
				b.review._id.toHexString().localeCompare(a.review._id.toHexString())
		)
		.slice(0, FEED_LIMIT);
	const homeUrl = new URL('/', origin).href;
	const feedUrl = new URL('/feed.xml', origin).href;
	const items = entries.map(({ review, publishedAt }) => {
		const link = new URL(`/${encodeURIComponent(review.slug)}`, origin).href;
		// RSS readers may render descriptions as HTML, so encode user text before XML encoding.
		const description = escapeXml(`${review.location}. Helhetsbetyg: ${review.rating}/3.`);
		return `<item>
<title>${escapeXml(review.title)}</title>
<link>${escapeXml(link)}</link>
<description>${escapeXml(description)}</description>
<guid isPermaLink="false">enstorstarkreview:review:${review._id.toHexString()}</guid>
<pubDate>${publishedAt.toUTCString()}</pubDate>
</item>`;
	});

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>En Stor Stark Review</title>
<link>${escapeXml(homeUrl)}</link>
<description>Nya barrecensioner från En Stor Stark Review.</description>
<language>sv-SE</language>
<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items.join('\n')}
</channel>
</rss>`;
};

export const loadPublicReviewFeed = async (
	collection: ReviewFeedCollection,
	origin: string
): Promise<string> => {
	const reviews = await collection
		.find(PUBLIC_REVIEW_FILTER, { projection: FEED_PROJECTION })
		.toArray();
	return buildReviewFeed(reviews, origin);
};
