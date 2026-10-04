import { describe, expect, it } from 'vitest';
import {
	getBarAttributeLabels,
	matchesBarAttributes,
	normalizeBarAttributes,
	setBarAttributeParams
} from './bar-attributes';

describe('bar attributes', () => {
	it('keeps only known keys in display order, once each', () => {
		expect(normalizeBarAttributes(['darts', 'unknown', 'quiz', 'darts', null, 42])).toEqual([
			'quiz',
			'darts'
		]);
		expect(getBarAttributeLabels(['sportsTv', 'liveMusic', 'quiz'])).toEqual([
			'Quiz',
			'Livemusik',
			'Sport-TV'
		]);
	});

	it.each([undefined, null, 'quiz', {}, 0])(
		'defaults malformed or missing values to empty: %s',
		(value) => {
			expect(normalizeBarAttributes(value)).toEqual([]);
		}
	);

	it('matches any selected attribute, with empty filters matching legacy bars too', () => {
		expect(matchesBarAttributes(['quiz'], ['quiz', 'darts'])).toBe(true);
		expect(matchesBarAttributes(['darts'], ['quiz', 'darts'])).toBe(true);
		expect(matchesBarAttributes(['karaoke'], ['quiz', 'darts'])).toBe(false);
		expect(matchesBarAttributes(undefined, ['quiz'])).toBe(false);
		expect(matchesBarAttributes(undefined, [])).toBe(true);
	});

	it('replaces only attribute parameters and supports clearing and reloading', () => {
		const params = new URLSearchParams('search=bar&sort=score&attributes=unknown');
		setBarAttributeParams(params, ['darts', 'quiz', 'darts']);
		expect(
			normalizeBarAttributes(new URLSearchParams(params.toString()).getAll('attributes'))
		).toEqual(['quiz', 'darts']);
		expect(params.get('search')).toBe('bar');
		expect(params.get('sort')).toBe('score');
		setBarAttributeParams(params, []);
		expect(params.toString()).toBe('search=bar&sort=score');
	});
});
