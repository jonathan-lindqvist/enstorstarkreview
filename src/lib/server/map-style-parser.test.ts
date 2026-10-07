import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const styleRequire = createRequire(require.resolve('@maplibre/maplibre-gl-style-spec'));
const { parse } = styleRequire('@mapbox/jsonlint-lines-primitives') as {
	parse: (source: string) => unknown;
};
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec') as {
	validateStyleMin: (style: unknown) => unknown[];
};

describe('MapLibre style parser compatibility', () => {
	it('parses a style with Swedish attribution through the resolved parser', () => {
		const style = {
			version: 8,
			sources: {
				fixture: {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] },
					attribution: 'Kartkälla i Göteborg'
				}
			},
			layers: [{ id: 'fixture', type: 'circle', source: 'fixture' }]
		};
		const parsed = parse(JSON.stringify(style));
		// jsonlint boxes primitives with line metadata for style validation diagnostics.
		expect(JSON.parse(JSON.stringify(parsed))).toEqual(style);
		expect(validateStyleMin(parsed)).toEqual([]);
	});

	it.each(['{"version":8,}', '{version:8}'])('rejects malformed style JSON: %s', (source) => {
		expect(() => parse(source)).toThrow();
	});
});
