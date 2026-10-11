import { MAX_BEER_BRAND_LENGTH, OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
import { MAX_LONG_TEXT, MAX_SHORT_TEXT, MAX_SLUG_LENGTH } from '$lib/constants';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type { ReviewRatingKey, ReviewRatingValues } from '$lib/types/bar-review';
import { MAX_BEER_PRICE_KR, isValidBeerPriceKr } from '$lib/utils/price';
import { sanitizeSlug } from '$lib/utils/slug';

/** The steps of the review wizard, in order. The iOS app uses the same steps. */
export const REVIEW_WIZARD_STEPS = ['photo', 'bar', 'beer', 'ratings', 'text', 'authors'] as const;

export type ReviewWizardStep = (typeof REVIEW_WIZARD_STEPS)[number];

export const REVIEW_WIZARD_STEP_TITLES: Record<ReviewWizardStep, string> = {
	photo: 'Bild',
	bar: 'Bar',
	beer: 'Stor stark',
	ratings: 'Betyg',
	text: 'Helhet & text',
	authors: 'Vem'
};

// The server's root pointer `/` marks a failure of the whole save (storage, a concurrent edit, or
// tampered ratings), so it opens no step; the page shows its message above the form.
const RATING_POINTERS = new Set<string>(REVIEW_RATING_METRICS.map((m) => `/${m.key}`));

/** The step that shows the field of a form problem pointer. Null for pointers no step shows. */
export const wizardStepForPointer = (pointer: string): ReviewWizardStep | null => {
	if (!pointer) return null;
	const normalized = pointer.startsWith('/') ? pointer : `/${pointer}`;
	if (normalized === '/image') return 'photo';
	if (['/bar-name', '/address', '/slug', '/attributes'].includes(normalized)) return 'bar';
	if (['/beer-brand', '/custom-beer-brand', '/beer-price'].includes(normalized)) return 'beer';
	if (RATING_POINTERS.has(normalized)) return 'ratings';
	if (normalized === '/rating' || normalized === '/description') return 'text';
	if (normalized === '/authors') return 'authors';
	return null;
};

export interface ReviewWizardValues {
	mode: 'create' | 'edit';
	hasImage: boolean;
	/** The problem of a chosen image file, from `validateImageFile`. */
	imageError: string;
	/** A new review came back from a rejected save, which never keeps the chosen file. */
	imageLost?: boolean;
	barName: string;
	address: string;
	slug: string;
	beerBrandSelection: string;
	customBeerBrand: string;
	beerPriceKr: string | number | null | undefined;
	description: string;
	authors: string[];
}

export type ReviewWizardProblems = Record<string, string>;

const isBlank = (value: string) => value.trim().length === 0;

const formatLimit = (limit: number) => limit.toLocaleString('sv-SE');

/** A message when the text is longer than the server accepts. */
const tooLong = (value: string, limit: number, what: string) =>
	value.length > limit ? `${what} får vara högst ${formatLimit(limit)} tecken.` : null;

/** Collects the messages that apply, keyed by pointer. */
const collect = (checks: Array<[string, string | null | false]>): ReviewWizardProblems =>
	Object.fromEntries(checks.filter((check): check is [string, string] => Boolean(check[1])));

const parsePrice = (value: ReviewWizardValues['beerPriceKr']): number => {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string' || isBlank(value)) return Number.NaN;
	return Number(value);
};

/**
 * The problems of one step, keyed by the server's problem pointer. The server checks everything
 * again when the review is saved; these checks only keep a reviewer from walking past an empty
 * field.
 */
export const wizardStepProblems = (
	step: ReviewWizardStep,
	values: ReviewWizardValues
): ReviewWizardProblems => {
	switch (step) {
		case 'photo':
			return collect([
				[
					'/image',
					values.imageError ||
						(values.mode === 'create' &&
							!values.hasImage &&
							(values.imageLost
								? 'Välj bilden igen. Den följer inte med när utkastet inte kunde sparas.'
								: 'Välj en bild på baren.'))
				]
			]);
		case 'bar':
			return collect([
				[
					'/bar-name',
					isBlank(values.barName)
						? 'Skriv barens namn.'
						: tooLong(values.barName, MAX_SHORT_TEXT, 'Namnet')
				],
				[
					'/address',
					isBlank(values.address)
						? 'Skriv adressen.'
						: tooLong(values.address, MAX_SHORT_TEXT, 'Adressen')
				],
				[
					'/slug',
					// A new review's link follows the name, so a missing name is the only problem.
					values.mode === 'create' && isBlank(values.barName)
						? null
						: !sanitizeSlug(values.slug)
							? 'Skriv en länk med bokstäver eller siffror, eller skapa en från namnet.'
							: tooLong(values.slug, MAX_SLUG_LENGTH, 'Länken')
				]
			]);
		case 'beer':
			return collect([
				[
					'/beer-price',
					!isValidBeerPriceKr(parsePrice(values.beerPriceKr)) &&
						`Ange priset i hela kronor, mellan 1 och ${MAX_BEER_PRICE_KR} kr.`
				],
				[
					'/custom-beer-brand',
					values.beerBrandSelection === OTHER_BEER_BRAND_VALUE &&
						(isBlank(values.customBeerBrand)
							? 'Skriv märkets namn.'
							: tooLong(values.customBeerBrand, MAX_BEER_BRAND_LENGTH, 'Märkets namn'))
				],
				[
					'/beer-brand',
					values.beerBrandSelection !== OTHER_BEER_BRAND_VALUE &&
						!isListedBeerBrand(values.beerBrandSelection) &&
						'Välj ett ölmärke eller skriv ett eget.'
				]
			]);
		case 'ratings':
			return {};
		case 'text':
			return collect([
				[
					'/description',
					isBlank(values.description)
						? 'Skriv några rader om baren.'
						: tooLong(values.description, MAX_LONG_TEXT, 'Texten')
				]
			]);
		case 'authors':
			return collect([['/authors', values.authors.length === 0 && 'Välj minst en författare']]);
	}
};

/** The first problem in step order, or null when every step is complete. */
export const firstWizardProblem = (
	values: ReviewWizardValues
): { step: ReviewWizardStep; pointer: string; message: string } | null => {
	for (const step of REVIEW_WIZARD_STEPS) {
		const [problem] = Object.entries(wizardStepProblems(step, values));
		if (problem) return { step, pointer: problem[0], message: problem[1] };
	}
	return null;
};

const RATING_WORDS: Record<ReviewRatingKey, readonly string[]> = {
	atmosphere: ['Död', 'Steril', 'Sådär', 'Trivsam', 'Mysig', 'Magisk'],
	service: ['Ignorerad', 'Sur', 'Långsam', 'Okej', 'Snabb', 'Stammisvänlig'],
	selection: ['Bara en', 'Två kranar', 'Några', 'Bra', 'Brett', 'Ölhimmel'],
	quality: ['Avslagen', 'Tunn', 'Okej', 'God', 'Fräsch', 'Perfekt'],
	price: ['Rån', 'Dyrt', 'Sådär', 'Okej', 'Prisvärt', 'Fynd'],
	cleanliness: ['Kladdigt', 'Smutsigt', 'Sådär', 'Rent', 'Skinande', 'Kliniskt'],
	soundLevel: ['Öronbedövande', 'Högljutt', 'Livligt', 'Sorl', 'Lugnt', 'Tyst'],
	barhopPotential: [
		'Återvändsgränd',
		'Långt bort',
		'Sådär',
		'Nära till mer',
		'Bra nav',
		'Mitt i smeten'
	]
};

const OVERALL_RATING_WORDS = ['Inget extra', 'Sticker ut', 'Riktigt bra', 'Måste upplevas'];

const clampIndex = (value: number, max: number) =>
	Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 0, 0), max);

/** A short word for each aspect value 0–5. */
export const ratingWord = (key: ReviewRatingKey, value: number): string =>
	RATING_WORDS[key][clampIndex(value, 5)];

/** A short word for each overall rating 0–3. */
export const overallRatingWord = (value: number): string =>
	OVERALL_RATING_WORDS[clampIndex(value, 3)];

/** The weighted sum of the aspects, 0–5. `calculateOverallRating` turns it into 0–3. */
export const weightedReviewScore = (ratings: ReviewRatingValues): number =>
	REVIEW_RATING_METRICS.reduce(
		(sum, metric) => sum + (ratings[metric.key] ?? 0) * metric.weight,
		0
	);

/** The rating aspect that a problem pointer names, or the first aspect. */
export const ratingIndexForPointer = (pointer: string): number => {
	const key = pointer.replace(/^\//, '');
	return Math.max(
		0,
		REVIEW_RATING_METRICS.findIndex((metric) => metric.key === key)
	);
};
