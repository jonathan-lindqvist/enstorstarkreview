import { describe, expect, it } from 'vitest';
import { OTHER_BEER_BRAND_VALUE } from '$lib/beer-brands';
import { createReviewRatingValues } from '$lib/review-metadata';
import {
	REVIEW_WIZARD_STEPS,
	firstWizardProblem,
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
		['/', 'ratings'],
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
		expect(wizardStepForPointer('')).toBeNull();
	});
});

describe('wizardStepProblems', () => {
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

	it('checks the slug only when editing', () => {
		const values = { ...completeValues, slug: ' ' };
		expect(wizardStepProblems('bar', values)).toEqual({});
		expect(wizardStepProblems('bar', { ...values, mode: 'edit' })).toEqual({
			'/slug': 'Skriv en länk eller skapa en från namnet.'
		});
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
