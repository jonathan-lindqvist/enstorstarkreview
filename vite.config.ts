import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		esbuildOptions: {
			sourcemap: false
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
