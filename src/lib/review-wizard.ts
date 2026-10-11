import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type { ReviewRatingKey, ReviewRatingValues } from '$lib/types/bar-review';
import { MAX_BEER_PRICE_KR, isValidBeerPriceKr } from '$lib/utils/price';

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

const RATING_POINTERS = new Set<string>(['/', ...REVIEW_RATING_METRICS.map((m) => `/${m.key}`)]);

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
	const problems: ReviewWizardProblems = {};
	switch (step) {
		case 'photo':
			if (values.imageError) problems['/image'] = values.imageError;
			else if (values.mode === 'create' && !values.hasImage) {
				problems['/image'] = 'Välj en bild på baren.';
			}
			break;
		case 'bar':
			if (isBlank(values.barName)) problems['/bar-name'] = 'Skriv barens namn.';
			if (isBlank(values.address)) problems['/address'] = 'Skriv adressen.';
			if (values.mode === 'edit' && isBlank(values.slug)) {
				problems['/slug'] = 'Skriv en länk eller skapa en från namnet.';
			}
			break;
		case 'beer':
			if (!isValidBeerPriceKr(parsePrice(values.beerPriceKr))) {
				problems['/beer-price'] =
					`Ange priset i hela kronor, mellan 1 och ${MAX_BEER_PRICE_KR} kr.`;
			}
			if (values.beerBrandSelection === OTHER_BEER_BRAND_VALUE) {
				if (isBlank(values.customBeerBrand)) problems['/custom-beer-brand'] = 'Skriv märkets namn.';
			} else if (!isListedBeerBrand(values.beerBrandSelection)) {
				problems['/beer-brand'] = 'Välj ett ölmärke eller skriv ett eget.';
			}
			break;
		case 'ratings':
			break;
		case 'text':
			if (isBlank(values.description)) problems['/description'] = 'Skriv några rader om baren.';
			break;
		case 'authors':
			if (values.authors.length === 0) problems['/authors'] = 'Välj minst en författare';
			break;
	}
	return problems;
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
