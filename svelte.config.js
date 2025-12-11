import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Explicit Node.js adapter for self-hosted deployment
		adapter: adapter({
			// Externalize native modules that can't be bundled
			external: ['better-sqlite3']
		}),
		// Disable CSRF origin check for self-hosted access via IP/LAN
		csrf: {
			checkOrigin: false
		}
	},

	vitePlugin: {
		// Externalize native modules from Vite's SSR bundling
		inspector: false
	}
};

export default config;
