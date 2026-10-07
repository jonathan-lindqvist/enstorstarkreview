import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Resolve from Kit so this also covers a nested copy, rather than an unrelated root cookie.
const require = createRequire(import.meta.url);
const kitRequire = createRequire(require.resolve('@sveltejs/kit/package.json'));
const { parse, serialize } = kitRequire('cookie') as {
	parse: (header: string) => Record<string, string>;
	serialize: (name: string, value: string, options?: Record<string, unknown>) => string;
};

describe('SvelteKit cookie dependency', () => {
	it.each([
		['name', 'session; injected=value'],
		['path', '/; SameSite=None'],
		['domain', 'example.org; injected=value']
	])('rejects attribute injection through %s', (attribute, value) => {
		expect(() =>
			serialize(attribute === 'name' ? value : 'session', 'value', {
				...(attribute === 'name' ? {} : { [attribute]: value })
			})
		).toThrow(TypeError);
	});

	it('round-trips Swedish text and retains session security attributes', () => {
		const header = serialize('session', 'Göteborg; öl=ja', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax'
		});
		expect(header).toBe(
			'session=G%C3%B6teborg%3B%20%C3%B6l%3Dja; Path=/; HttpOnly; Secure; SameSite=Lax'
		);
		expect(parse(header).session).toBe('Göteborg; öl=ja');
	});
});
