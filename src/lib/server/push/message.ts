import type { BarReview } from '$lib/types/bar-review';

/** What a phone shows for a newly published review; only public review data. */
export interface ReviewNotification {
	title: string;
	body: string;
	slug: string;
}

const MAX_TITLE_LENGTH = 100;
const STAMP_WORDS = ['Ingen stämpel', 'En stämpel', 'Två stämplar', 'Tre stämplar'];

const isWholeKrona = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 999;

const truncate = (text: string, length: number): string =>
	text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;

export const buildReviewNotification = (
	review: Pick<BarReview, 'title' | 'slug' | 'rating' | 'beerPriceKr' | 'isHappyHourPrice'>
): ReviewNotification => {
	const barName = String(review.title ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const parts: string[] = [];

	const stamps = Number.isInteger(review.rating) ? STAMP_WORDS[review.rating] : undefined;
	if (stamps) parts.push(stamps);
	if (isWholeKrona(review.beerPriceKr)) {
		const happyHour = review.isHappyHourPrice === true ? ' (happy hour)' : '';
		parts.push(`Stor stark för ${review.beerPriceKr} kr${happyHour}`);
	}

	return {
		title: truncate(`Ny recension: ${barName}`, MAX_TITLE_LENGTH),
		body: parts.length > 0 ? parts.join(' · ') : 'Läs vad vi tyckte.',
		slug: review.slug
	};
};
