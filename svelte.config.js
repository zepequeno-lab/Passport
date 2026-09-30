import node from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    // Vercel supplies this environment variable during every deployment build.
    // Local Windows builds use adapter-node because adapter-vercel emits symlinks.
    adapter: process.env.VERCEL ? vercel() : node(),
  },
};
