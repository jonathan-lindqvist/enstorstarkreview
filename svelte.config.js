import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// This project is configured to use @sveltejs/adapter-node, which runs your app on a Node server.
		// To use a different adapter (for serverless, edge, etc.), switch out the adapter import and configuration.
		// See https://kit.svelte.dev/docs/adapters for more information about available adapters.
		adapter: adapter({
			precompress: false,
			envPrefix: '',
			polyfill: true
		}),
		csp: {
			mode: 'nonce',
			directives: {
				'default-src': ['self'],
				'img-src': [
					'self',
					'data:',
					'https://www.google-analytics.com',
					'https://www.googletagmanager.com'
				],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'script-src': ['self', 'https://www.googletagmanager.com'],
				'script-src-attr': ['unsafe-inline'],
				'connect-src': [
					'self',
					'https://www.google-analytics.com',
					'https://region1.google-analytics.com',
					'https://www.googletagmanager.com'
				],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
