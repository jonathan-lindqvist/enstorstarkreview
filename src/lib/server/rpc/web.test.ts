import { describe, expect, it, vi } from 'vitest';
import { problem } from './errors';
import { testDependencies, testEvent } from './test-fixtures';
import { webClient, webError, webFailure, webQuery } from './web';

vi.mock('$lib/server/review-image-previews', () => ({
	ReviewImagePreviewCapacityError: class extends Error {}
}));

describe('web door', () => {
	it('calls procedures as the cookie user with the web channel', async () => {
		const deps = testDependencies();
		await expect(webClient(testEvent('/', { deps })).sessions.current()).rejects.toMatchObject({
			status: 401,
			message: 'Du är inte inloggad'
		});
		const result = await webClient(testEvent('/', { deps, username: 'editor' })).users.list();
		expect(result).toEqual({ users: [{ username: 'editor' }] });
	});

	it('maps a procedure error to an action failure with its Swedish message', () => {
		expect(webFailure(problem('not_found', 'Recensionen hittades inte'))).toMatchObject({
			status: 404,
			data: { message: 'Recensionen hittades inte' }
		});
	});

	it('keeps the submitted values and field pointer of a rejected form', () => {
		const error = problem('validation_failed', 'Ogiltigt pris', {
			form: { status: 400, pointer: '/beer-price', values: { barName: 'Baren' } }
		});
		expect(webFailure(error)).toMatchObject({
			status: 400,
			data: { message: 'Ogiltigt pris', pointer: '/beer-price', barName: 'Baren' }
		});
		expect(webFailure(problem('bad_request', 'Fel'), { form: true })).toMatchObject({
			data: { pointer: '/' }
		});
	});

	it('rethrows unexpected errors instead of showing them', () => {
		const cause = new Error('database secret');
		expect(() => webFailure(cause)).toThrow(cause);
		expect(() => webError(cause)).toThrow(cause);
	});

	it('turns a procedure error in a load into the error page', () => {
		expect(() => webError(problem('not_found', 'Hittades inte'))).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});

	it('decodes repeated query keys like the API door', () => {
		expect(webQuery(new URL('http://localhost/?a=1&b=2&b=3&b=4'))).toEqual({
			a: '1',
			b: ['2', '3', '4']
		});
	});
});
