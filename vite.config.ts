import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    watch: { ignored: ['**/test-results*/**', '**/playwright-report/**', '**/build/**'] },
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        // Keep the public Host and Origin together for the game server's origin check.
        changeOrigin: false,
      },
    },
  },
});
