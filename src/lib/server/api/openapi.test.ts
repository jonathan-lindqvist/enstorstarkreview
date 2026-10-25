import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
	ratingKeys,
	ReviewRequestCreateRequest,
	ReviewUpdateRequest,
	SessionCreateRequest
} from './contract/schemas';
import { decodeRequest } from './http';
import { renderOpenApiYaml } from './openapi';

const CONTRACT_PATH = join(process.cwd(), 'openapi', 'v1.yaml');

describe('generated OpenAPI contract', () => {
	it('matches openapi/v1.yaml (run `npm run api:generate` after changing the HttpApi)', async () => {
		const generated = renderOpenApiYaml();
		if (process.env.UPDATE_OPENAPI === '1') await writeFile(CONTRACT_PATH, generated);
		expect(await readFile(CONTRACT_PATH, 'utf8')).toBe(generated);
	});
});

describe('untrusted API schema input', () => {
	const decode = (value: unknown) =>
		Effect.runSync(
			decodeRequest(SessionCreateRequest, value).pipe(
				Effect.flip,
				Effect.orElseSucceed(() => null)
			)
		);

	it('stops at the first structural error instead of allocating errors for every extra field', () => {
		const error = decode({
			username: 'test',
			password: 'testpass123',
			...Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`extra${index}`, index]))
		});
		expect(error?.errors).toHaveLength(1);
		expect(error?.errors[0].pointer).toBe('/extra0');
	});

	it('escapes unknown property names in JSON pointers', () => {
		expect(decode({ username: 'test', password: 'testpass123', 'extra/~': true })?.errors).toEqual([
			{ pointer: '/extra~1~0', detail: 'Fältet är okänt' }
		]);
	});

	it.each([
		[{ password: 'testpass123' }, '/username', 'Fältet saknas'],
		[{ username: 12, password: 'testpass123' }, '/username', 'Fältet har fel typ'],
		[{ username: 'a'.repeat(257), password: 'testpass123' }, '/username', 'Värdet är för långt']
	])('reports %j with a Swedish detail', (value, pointer, detail) => {
		expect(decode(value)?.errors).toEqual([{ pointer, detail }]);
	});

	it('names the field and rule for nested review input', () => {
		const error = Effect.runSync(
			decodeRequest(ReviewRequestCreateRequest, { barName: 'Bar', location: 3 }).pipe(Effect.flip)
		);
		expect(error.errors).toEqual([{ pointer: '/location', detail: 'Fältet har fel typ' }]);
	});
});

describe('review input rules', () => {
	it.each([
		[{ ratings: { atmosphere: 2.5 } }, '/ratings/atmosphere', 'Fältet har fel typ'],
		[
			{ ratings: { atmosphere: 9 } },
			'/ratings/atmosphere',
			'Värdet är utanför det tillåtna intervallet'
		],
		[{ authors: [] }, '/authors', 'Välj minst ett värde'],
		[{ beer: { brand: '' } }, '/beer/brand', 'Fältet får inte vara tomt']
	])('reports %j', (patch, pointer, detail) => {
		const ratings = Object.fromEntries(ratingKeys.map((key) => [key, 3]));
		const base = {
			title: 'Bar',
			description: 'Text',
			location: 'Gatan 1',
			ratings,
			beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: false },
			authors: ['editor'],
			imageFocus: { x: 50, y: 50 }
		};
		const value = {
			...base,
			...patch,
			ratings: { ...ratings, ...(patch as { ratings?: object }).ratings },
			beer: { ...base.beer, ...(patch as { beer?: object }).beer }
		};
		const error = Effect.runSync(decodeRequest(ReviewUpdateRequest, value).pipe(Effect.flip));
		expect(error.errors).toEqual([{ pointer, detail }]);
	});
});
