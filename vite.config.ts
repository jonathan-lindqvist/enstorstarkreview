import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

const nativeExternals = ['argon2'];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		external: nativeExternals
	},
	build: {
		rollupOptions: {
			external: nativeExternals
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
