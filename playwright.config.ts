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
// `make ci` builds the app in its own check first and runs shards side by side on their own ports.
const prebuilt = process.env.PLAYWRIGHT_PREBUILT === 'true';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const webhookPort = Number(process.env.PLAYWRIGHT_WEBHOOK_PORT ?? 4174);
const reviewImageDirectory =
	process.env.REVIEW_IMAGE_DIR ?? join(tmpdir(), 'enstorstarkreview-playwright-images');
process.env.REVIEW_IMAGE_DIR = reviewImageDirectory;

const config: PlaywrightTestConfig = {
	// Database-backed suites share rate limits and in-process application caches.
	workers: 1,
	webServer: externalBaseUrl
		? undefined
		: [
				{
					command: 'node tests/fixtures/discord-webhook-server.js',
					port: webhookPort
				},
				{
					command: `${prebuilt ? '' : 'npm run build && '}npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
					url: `http://127.0.0.1:${port}`,
					env: {
						// Docker's development NODE_ENV must not change the compiled auth-cookie policy.
						NODE_ENV: 'production',
						...(mongoUri ? { MONGO_URI: mongoUri } : {}),
						REVIEW_IMAGE_DIR: reviewImageDirectory,
						REVIEW_REQUEST_DISCORD_WEBHOOK_URL: `http://127.0.0.1:${webhookPort}/webhook`
					}
				}
			],
	use: {
		baseURL: externalBaseUrl ?? `http://127.0.0.1:${port}`
	},
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/
};

export default config;
