import type { PlaywrightTestConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from 'vite';

const fileEnv = loadEnv('test', process.cwd(), '');
const mongoUri = process.env.MONGO_URI ?? fileEnv.MONGO_URI;
if (mongoUri) {
	process.env.MONGO_URI = mongoUri;
}
const externalBaseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL;
const reviewImageDirectory =
	process.env.REVIEW_IMAGE_DIR ?? join(tmpdir(), 'enstorstarkreview-playwright-images');
process.env.REVIEW_IMAGE_DIR = reviewImageDirectory;

const config: PlaywrightTestConfig = {
	webServer: externalBaseUrl
		? undefined
		: [
				{
					command: 'node tests/fixtures/discord-webhook-server.js',
					port: 4174
				},
				{
					command: 'npm run build && npm run preview',
					port: 4173,
					env: {
						...(mongoUri ? { MONGO_URI: mongoUri } : {}),
						REVIEW_IMAGE_DIR: reviewImageDirectory,
						REVIEW_REQUEST_DISCORD_WEBHOOK_URL: 'http://127.0.0.1:4174/webhook'
					}
				}
			],
	use: {
		baseURL: externalBaseUrl ?? 'http://127.0.0.1:4173'
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/
};

export default config;
