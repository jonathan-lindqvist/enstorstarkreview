// Generates openapi/v1.yaml from the oRPC router, then src/lib/types/api-v1.d.ts from it.
// Run with `npm run api:generate`. A unit test fails when either checked-in file is stale.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { API_TYPES_PATH, renderApiTypes } from './generate-api-types.js';

export const API_SPEC_PATH = fileURLToPath(new URL('../openapi/v1.yaml', import.meta.url));

// Vite resolves `$lib` and TypeScript exactly as the app does. The router has no database
// imports, so this needs no MONGO_URI.
const vite = await createServer({
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const { renderOpenApiYaml } = await vite.ssrLoadModule('/src/lib/server/rpc/openapi-yaml.ts');
	await writeFile(API_SPEC_PATH, await renderOpenApiYaml());
	console.log(`Wrote ${API_SPEC_PATH}`);
	await writeFile(API_TYPES_PATH, await renderApiTypes());
	console.log(`Wrote ${API_TYPES_PATH}`);
} finally {
	await vite.close();
}
