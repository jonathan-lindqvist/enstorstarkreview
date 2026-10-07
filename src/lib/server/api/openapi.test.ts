import { describe, expect, it } from 'vitest';
import { validateAgainstSchema } from './openapi';

describe('untrusted API schema input', () => {
	it('stops at the first structural error instead of allocating errors for every extra field', () => {
		const value = {
			username: 'test',
			password: 'testpass123',
			...Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`extra${index}`, index]))
		};
		const result = validateAgainstSchema('SessionCreateRequest', value);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected rejection');
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].pointer).toBe('/extra0');
	});

	it('escapes unknown property names in JSON pointers', () => {
		const result = validateAgainstSchema('SessionCreateRequest', {
			username: 'test',
			password: 'testpass123',
			'extra/~': true
		});
		if (result.ok) throw new Error('Expected rejection');
		expect(result.errors).toEqual([{ pointer: '/extra~1~0', detail: 'Fältet är okänt' }]);
	});
});
