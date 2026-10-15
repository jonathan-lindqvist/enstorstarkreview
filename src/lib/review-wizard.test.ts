import { describe, expect, it } from 'vitest';
import { OTHER_BEER_BRAND_VALUE } from '$lib/beer-brands';
import { createReviewRatingValues } from '$lib/review-metadata';
import {
	REVIEW_WIZARD_STEPS,
	firstWizardProblem,
	ratingIndexForPointer,
	overallRatingWord,
	ratingWord,
	weightedReviewScore,
	wizardStepForPointer,
	wizardStepProblems,
	type ReviewWizardValues
} from './review-wizard';

const completeValues: ReviewWizardValues = {
	mode: 'create',
	hasImage: true,
	imageError: '',
	barName: 'Kronhuset',
	address: 'Postgatan 6, Göteborg',
	slug: 'kronhuset',
	beerBrandSelection: 'Falcon Export',
	customBeerBrand: '',
	beerPriceKr: '72',
	description: '- Fin innergård',
	authors: ['test']
};

describe('wizardStepForPointer', () => {
	it.each([
		['/image', 'photo'],
		['/bar-name', 'bar'],
		['/address', 'bar'],
		['/slug', 'bar'],
		['/attributes', 'bar'],
		['/beer-brand', 'beer'],
		['/custom-beer-brand', 'beer'],
		['/beer-price', 'beer'],
		['/beer-volume', 'beer'],
		['/atmosphere', 'ratings'],
		['/rating', 'text'],
		['/description', 'text'],
		['/authors', 'authors'],
		['authors', 'authors']
	] as const)('places %s on the %s step', (pointer, step) => {
		expect(wizardStepForPointer(pointer)).toBe(step);
	});

	it('places unknown pointers on no step', () => {
		expect(wizardStepForPointer('/id')).toBeNull();
		// The server's root pointer marks failures of the whole save, such as storage errors.
		expect(wizardStepForPointer('/')).toBeNull();
		expect(wizardStepForPointer('')).toBeNull();
	});
});

describe('wizardStepProblems', () => {
	it('allows blank size but rejects non-integer and out-of-range sizes on the beer step', () => {
		for (const beerVolumeCl of ['', undefined, null, '1', '50', '200']) {
			expect(wizardStepProblems('beer', { ...completeValues, beerVolumeCl })).toEqual({});
		}
		for (const beerVolumeCl of ['0', '-1', '201', '33.5', 'Infinity', 'unknown']) {
			expect(wizardStepProblems('beer', { ...completeValues, beerVolumeCl })).toHaveProperty(
				'/beer-volume'
			);
		}
	});
	it('accepts a complete review on every step', () => {
		for (const step of REVIEW_WIZARD_STEPS) {
			expect(wizardStepProblems(step, completeValues)).toEqual({});
		}
		expect(firstWizardProblem(completeValues)).toBeNull();
	});

	it('requires a photo for a new review but not for an edit', () => {
		const values = { ...completeValues, hasImage: false };
		expect(wizardStepProblems('photo', values)).toEqual({ '/image': 'Välj en bild på baren.' });
		expect(wizardStepProblems('photo', { ...values, mode: 'edit' })).toEqual({});
	});

	it('shows the problem of a rejected image file', () => {
		const values = { ...completeValues, imageError: 'För stor bild' };
		expect(wizardStepProblems('photo', values)).toEqual({ '/image': 'För stor bild' });
		expect(wizardStepProblems('photo', { ...values, mode: 'edit' })).toEqual({
			'/image': 'För stor bild'
		});
	});

	it('treats whitespace as an empty name, address, and text', () => {
		const values = { ...completeValues, barName: '  ', address: '\n', description: ' \t ' };
		expect(wizardStepProblems('bar', values)).toEqual({
			'/bar-name': 'Skriv barens namn.',
			'/address': 'Skriv adressen.'
		});
		expect(wizardStepProblems('text', values)).toEqual({
			'/description': 'Skriv några rader om baren.'
		});
	});

	it('requires a link that keeps a letter or digit once it is cleaned', () => {
		const message = 'Skriv en länk med bokstäver eller siffror, eller skapa en från namnet.';
		for (const mode of ['create', 'edit'] as const) {
			expect(wizardStepProblems('bar', { ...completeValues, mode, slug: ' ' })).toEqual({
				'/slug': message
			});
			expect(wizardStepProblems('bar', { ...completeValues, mode, slug: '!!! ---' })).toEqual({
				'/slug': message
			});
		}
		expect(wizardStepProblems('bar', { ...completeValues, slug: 'kronhuset-2' })).toEqual({});
		expect(wizardStepProblems('bar', { ...completeValues, slug: 'åkes-bar' })).toEqual({});
	});

	it('leaves the link of a new review alone while the name is missing', () => {
		expect(wizardStepProblems('bar', { ...completeValues, barName: '', slug: '' })).toEqual({
			'/bar-name': 'Skriv barens namn.'
		});
	});

	it.each([
		['name', 'bar', { barName: 'x'.repeat(301) }, '/bar-name', 'Namnet får vara högst 300 tecken.'],
		[
			'address',
			'bar',
			{ address: 'x'.repeat(301) },
			'/address',
			'Adressen får vara högst 300 tecken.'
		],
		['link', 'bar', { slug: 'x'.repeat(201) }, '/slug', 'Länken får vara högst 200 tecken.'],
		[
			'custom brand',
			'beer',
			{ beerBrandSelection: OTHER_BEER_BRAND_VALUE, customBeerBrand: 'x'.repeat(101) },
			'/custom-beer-brand',
			'Märkets namn får vara högst 100 tecken.'
		],
		[
			'text',
			'text',
			{ description: 'x'.repeat(20001) },
			'/description',
			'Texten får vara högst 20 000 tecken.'
		]
	] as const)('limits the length of the %s', (_label, step, change, pointer, message) => {
		expect(wizardStepProblems(step, { ...completeValues, ...change })).toEqual({
			[pointer]: message
		});
	});

	it('accepts text at the length limits', () => {
		const values = {
			...completeValues,
			barName: 'x'.repeat(300),
			address: 'x'.repeat(300),
			slug: 'x'.repeat(200),
			description: 'x'.repeat(20000)
		};
		expect(wizardStepProblems('bar', values)).toEqual({});
		expect(wizardStepProblems('text', values)).toEqual({});
	});

	it('asks again for the photo of a new review after a rejected save', () => {
		const values = { ...completeValues, hasImage: false, imageLost: true };
		expect(wizardStepProblems('photo', values)).toEqual({
			'/image': 'Välj bilden igen. Den följer inte med när utkastet inte kunde sparas.'
		});
		expect(wizardStepProblems('photo', { ...values, hasImage: true })).toEqual({});
	});

	it.each(['', '0', '1000', '72.5', 'abc', null, undefined])(
		'rejects the price %j',
		(beerPriceKr) => {
			expect(wizardStepProblems('beer', { ...completeValues, beerPriceKr })).toEqual({
				'/beer-price': 'Ange priset i hela kronor, mellan 1 och 999 kr.'
			});
		}
	);

	it.each(['1', '999', 72])('accepts the price %j', (beerPriceKr) => {
		expect(wizardStepProblems('beer', { ...completeValues, beerPriceKr })).toEqual({});
	});

	it('requires a listed brand or a custom name', () => {
		expect(wizardStepProblems('beer', { ...completeValues, beerBrandSelection: 'Okänd' })).toEqual({
			'/beer-brand': 'Välj ett ölmärke eller skriv ett eget.'
		});
		const other = { ...completeValues, beerBrandSelection: OTHER_BEER_BRAND_VALUE };
		expect(wizardStepProblems('beer', { ...other, customBeerBrand: ' ' })).toEqual({
			'/custom-beer-brand': 'Skriv märkets namn.'
		});
		expect(wizardStepProblems('beer', { ...other, customBeerBrand: 'Egen lager' })).toEqual({});
	});

	it('requires at least one author', () => {
		expect(wizardStepProblems('authors', { ...completeValues, authors: [] })).toEqual({
			'/authors': 'Välj minst en författare'
		});
	});

	it('returns the first problem in step order', () => {
		expect(
			firstWizardProblem({ ...completeValues, authors: [], barName: '', hasImage: false })
		).toEqual({ step: 'photo', pointer: '/image', message: 'Välj en bild på baren.' });
		expect(firstWizardProblem({ ...completeValues, authors: [], beerPriceKr: '' })).toEqual({
			step: 'beer',
			pointer: '/beer-price',
			message: 'Ange priset i hela kronor, mellan 1 och 999 kr.'
		});
	});
});

describe('rating words', () => {
	it('names every value of an aspect and clamps out-of-range values', () => {
		expect(ratingWord('atmosphere', 0)).toBe('Död');
		expect(ratingWord('atmosphere', 5)).toBe('Magisk');
		expect(ratingWord('soundLevel', 9)).toBe('Tyst');
		expect(ratingWord('price', -1)).toBe('Rån');
	});

	it('names the overall rating', () => {
		expect(overallRatingWord(0)).toBe('Inget extra');
		expect(overallRatingWord(3)).toBe('Måste upplevas');
		expect(overallRatingWord(7)).toBe('Måste upplevas');
	});
});

describe('weightedReviewScore', () => {
	it('weights each aspect', () => {
		expect(weightedReviewScore(createReviewRatingValues(0))).toBe(0);
		expect(weightedReviewScore(createReviewRatingValues(5))).toBeCloseTo(5);
		expect(weightedReviewScore({ ...createReviewRatingValues(0), atmosphere: 5 })).toBeCloseTo(0.9);
	});
});

describe('ratingIndexForPointer', () => {
	it('opens the aspect that a problem names', () => {
		expect(ratingIndexForPointer('/atmosphere')).toBe(0);
		expect(ratingIndexForPointer('/barhopPotential')).toBe(7);
		expect(ratingIndexForPointer('price')).toBe(4);
	});

	it('starts at the first aspect for other pointers', () => {
		expect(ratingIndexForPointer('/')).toBe(0);
		expect(ratingIndexForPointer('/bar-name')).toBe(0);
		expect(ratingIndexForPointer('')).toBe(0);
	});
});
