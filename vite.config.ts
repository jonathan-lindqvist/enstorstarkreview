import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern'
			},
			sass: {
				api: 'modern'
			}
		}
	},
	optimizeDeps: {
		esbuildOptions: {
			sourcemap: false
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
