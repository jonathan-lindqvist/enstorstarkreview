import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

const nativeExternals = ['argon2'];

// The native app and its build output (mobile/.build) are large and change during every Xcode build.
const watchIgnored = ['**/mobile/**'];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
		rollupOptions: {
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
			reporter: ['text', 'json-summary', 'html']
		}
	}
});
