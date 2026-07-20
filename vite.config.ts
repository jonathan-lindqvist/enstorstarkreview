import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

const nativeExternals = ['argon2'];

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Docker bind mounts deliver no file system events; only dev containers set this.
		watch: process.env.VITE_DEV_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined
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
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
