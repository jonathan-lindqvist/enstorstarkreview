import type { SerializedBarReview } from './types/bar-review';
import type { HomeReviewCard } from './types/home-reviews';
import { HOME_REVIEW_PAGE_SIZE, homeReviewHref, normalizeHomeReviewQuery } from './home-reviews';
import { isReviewImageFilename } from './utils/review-image';
import { getReviewAuthors } from './utils/authors';

export const SITE_ORIGIN = 'https://enstorstarkreview.se';
export const SITE_NAME = 'En Stor Stark Review';
const DEFAULT_DESCRIPTION =
	'Barrecensioner med ölpriser, betyg och upplevelser – främst i Göteborg. Hitta nästa bar för en stor stark.';

export const siteUrl = (path: string): string => {
	const url = new URL(SITE_ORIGIN);
	const [pathname, search = ''] = path.split('?');
	url.pathname = pathname;
	url.search = search;
	return url.href;
};

export const plainReviewText = (text: string): string =>
	text
		.replace(/<[^>]*>/g, ' ')
		.replace(/[#*_~`>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

export const serializeJsonLd = (value: unknown): string =>
	JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');

export const jsonLdScript = (value: unknown): string =>
	`<script type="application/ld+json">${serializeJsonLd(value)}</script>`;

export interface SeoPageData {
	bar?: SerializedBarReview;
	bars?: HomeReviewCard[];
	publishedAt?: string | null;
}

export const publicReviewListSchema = (bars: HomeReviewCard[], page: number) => ({
	'@context': 'https://schema.org',
	'@type': 'ItemList',
	itemListElement: bars
		.filter((bar) => bar.publicationStatus === 'published')
		.map((bar, index) => ({
			'@type': 'ListItem',
			position: (page - 1) * HOME_REVIEW_PAGE_SIZE + index + 1,
			url: siteUrl(`/${encodeURIComponent(bar.slug)}`),
			name: bar.title
		}))
});

export const getSeoMetadata = (url: URL, data: SeoPageData, status = 200) => {
	const query = normalizeHomeReviewQuery(url.searchParams);
	const page = Number(url.searchParams.get('page'));
	query.page = Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
	const home = url.pathname === '/';
	const publicReview =
		status < 400 &&
		data.bar?.publicationStatus === 'published' &&
		url.pathname === `/${encodeURIComponent(data.bar.slug)}`;
	const staticPages: Record<string, { title: string; description: string }> = {
		'/': { title: 'Barrecensioner och ölpriser', description: DEFAULT_DESCRIPTION },
		'/karta': {
			title: 'Karta över recenserade barer',
			description: 'Hitta recenserade barer på kartan och jämför ölpriser och betyg.'
		},
		'/statistik': {
			title: 'Statistik över ölpriser och barer',
			description: 'Jämför ölpriser, ölmärken och betyg från våra publicerade barrecensioner.'
		},
		'/about': {
			title: 'Vanliga frågor',
			description:
				'Så fungerar våra barrecensioner, betyg och prisjämförelser på En Stor Stark Review.'
		},
		'/installningar': {
			title: 'Inställningar',
			description: 'Välj tema, platsåtkomst och analysinställningar.'
		},
		'/login': { title: 'Logga in', description: DEFAULT_DESCRIPTION }
	};
	const filtered =
		(home || url.pathname === '/karta') &&
		Boolean(query.search || query.attributes.length || query.sort !== 'latest');
	const noindex =
		status >= 400 ||
		filtered ||
		(!['/', '/karta', '/statistik', '/about'].includes(url.pathname) && !publicReview);
	const canonical = siteUrl(
		home
			? homeReviewHref(query)
			: publicReview
				? `/${encodeURIComponent(data.bar!.slug)}`
				: url.pathname
	);
	const utilityTitle = url.pathname.endsWith('/history')
		? 'Recensionshistorik'
		: url.pathname.endsWith('/edit')
			? 'Redigera recension'
			: url.pathname.startsWith('/admin/reviews/create')
				? 'Skapa recension'
				: url.pathname === '/admin/reviews'
					? 'Hantera recensioner'
					: 'Privat sida';
	let title = staticPages[url.pathname]?.title ?? utilityTitle;
	let description = staticPages[url.pathname]?.description ?? DEFAULT_DESCRIPTION;
	let image = siteUrl('/logo-social.png');
	const structuredData: Record<string, unknown>[] = [];
	if (home) {
		if (query.page > 1) title += ` – sida ${query.page}`;
		if (!noindex)
			structuredData.push({
				'@context': 'https://schema.org',
				'@type': 'WebSite',
				name: SITE_NAME,
				url: SITE_ORIGIN,
				inLanguage: 'sv-SE'
			});
	}
	if (publicReview && data.bar) {
		const bar = data.bar;
		title = `${bar.title} – recension och ölpris`;
		description = plainReviewText(`${bar.title}, ${bar.location}. ${bar.description}`).slice(
			0,
			160
		);
		if (isReviewImageFilename(bar.image)) image = siteUrl(`/images/${bar.image}?preview=detail-v1`);
		const rating =
			Number.isFinite(bar.rating) && bar.rating >= 0 && bar.rating <= 3
				? { '@type': 'Rating', ratingValue: bar.rating, bestRating: 3, worstRating: 0 }
				: undefined;
		structuredData.push({
			'@context': 'https://schema.org',
			'@type': 'Review',
			url: canonical,
			inLanguage: 'sv-SE',
			itemReviewed: { '@type': 'BarOrPub', name: bar.title, address: bar.location, image },
			author: getReviewAuthors(bar)
				.filter((name) => typeof name === 'string' && name.trim())
				.map((name) => ({ '@type': 'Person', name })),
			reviewBody: plainReviewText(bar.description),
			reviewRating: rating,
			...(data.publishedAt ? { datePublished: data.publishedAt } : {})
		});
	}
	if (status >= 400) title = status === 404 ? 'Sidan finns inte' : 'Något gick fel';
	return {
		title: `${title} – ${SITE_NAME}`,
		description,
		image,
		canonical,
		noindex,
		type: publicReview ? 'article' : 'website',
		structuredData
	};
};
