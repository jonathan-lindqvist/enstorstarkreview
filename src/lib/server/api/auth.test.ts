import { describe, expect, it, vi } from 'vitest';
import { authenticateApiRequest, isApiPath, readBearerToken } from './auth';

describe('API authentication', () => {
	it.each([null, '', 'Basic token', 'Bearer', 'Bearer a b', 'Bearer\ttoken'])(
		'ignores malformed authorization %j without looking up a session',
		async (header) => {
			const validate = vi.fn();
			expect(readBearerToken(header)).toBeNull();
			expect(await authenticateApiRequest(header, validate)).toEqual({ user: null, session: null });
			expect(validate).not.toHaveBeenCalled();
		}
	);

	it('accepts a case-insensitive bearer scheme and validates the exact token', async () => {
		const result = { user: { username: 'test' }, session: { id: 'token' } };
		const validate = vi.fn().mockResolvedValue(result);
		expect(await authenticateApiRequest('bEaReR  token ', validate)).toEqual(result);
		expect(validate).toHaveBeenCalledExactlyOnceWith('token');
	});

	it.each([
		{ user: null, session: null },
		{ user: { username: 'test' }, session: null },
		{ user: null, session: { id: 'token' } }
	])('fails closed for a revoked, expired, or orphaned session', async (result) => {
		expect(await authenticateApiRequest('Bearer token', vi.fn().mockResolvedValue(result))).toEqual(
			{
				user: null,
				session: null
			}
		);
	});

	it('propagates unavailable validation instead of authenticating', async () => {
		await expect(
			authenticateApiRequest('Bearer token', vi.fn().mockRejectedValue(new Error('unavailable')))
		).rejects.toThrow('unavailable');
	});

	it('keeps the API prefix separate from similarly named web routes', () => {
		expect(isApiPath('/api/v1/reviews')).toBe(true);
		expect(isApiPath('/api/unknown')).toBe(true);
		expect(isApiPath('/apiary')).toBe(false);
		expect(isApiPath('/login')).toBe(false);
	});
});
