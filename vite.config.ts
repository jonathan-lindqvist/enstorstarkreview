import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

const nativeExternals = ['argon2'];

// The native app and its build output (mobile/.build) are large and change during every Xcode build.
const watchIgnored = ['**/mobile/**'];

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ precompress: false, envPrefix: '' }),
			// hooks.server rejects cross-origin web writes before auth. The API is bearer-only;
			// Kit's global check would reject its bodyless native requests before hooks can run.
			csrf: { trustedOrigins: ['*'] },

			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://tiles.openfreemap.org',
						'https://www.google-analytics.com',
						'https://www.googletagmanager.com'
					],
					'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
					'script-src': ['self', 'https://www.googletagmanager.com'],
					'script-src-attr': ['unsafe-inline'],
					'connect-src': [
						'self',
						'https://tiles.openfreemap.org',
						'https://www.google-analytics.com',
						'https://region1.google-analytics.com',
						'https://www.googletagmanager.com'
					],
					'font-src': ['self', 'https://fonts.gstatic.com'],
					'worker-src': ['self', 'blob:'],
					'child-src': ['self', 'blob:'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	server: {
		// Docker bind mounts deliver no file system events; only dev containers set this.
		watch:
			process.env.VITE_DEV_POLLING === 'true'
				? { usePolling: true, interval: 300, ignored: watchIgnored }
				: { ignored: watchIgnored }
	},
	ssr: {
		external: nativeExternals
	},
	build: {
		rolldownOptions: {
			external: nativeExternals
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{js,ts}'],
			exclude: [
				'**/*.{test,spec}.{js,ts}',
				'**/*.d.ts',
				'**/test-fixtures.{js,ts}',
				'**/fixtures/**',
				'**/__fixtures__/**'
			],
			reporter: ['text', 'json-summary', 'html'],
			// The coverage floor: `npm run test:coverage` fails below it. Raise it with
			// `npm run test:coverage:update` and commit the result; lower it only as a deliberate,
			// reviewed decision.
			thresholds: {
				lines: 79.56,
				branches: 78.66,
				functions: 84.3,
				statements: 78.88
			}
		}
	}
});
