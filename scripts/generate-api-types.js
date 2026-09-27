// Generates src/lib/types/api-v1.d.ts from openapi/v1.yaml.
// Run with `npm run api:types`. A unit test fails when the checked-in file is stale.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const root = new URL('../', import.meta.url);
export const API_SPEC_URL = new URL('openapi/v1.yaml', root);
export const API_TYPES_PATH = fileURLToPath(new URL('src/lib/types/api-v1.d.ts', root));

const HEADER = `/**
 * Generated from openapi/v1.yaml by scripts/generate-api-types.js.
 * Do not edit by hand. Run \`npm run api:types\` after changing the contract.
 */

`;

export const renderApiTypes = async () => {
	const source = await readFile(API_SPEC_URL, 'utf8');
	const ast = await openapiTS(source, { alphabetize: true, immutable: false });
	return HEADER + astToString(ast);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await writeFile(API_TYPES_PATH, await renderApiTypes());
	console.log(`Wrote ${API_TYPES_PATH}`);
}
