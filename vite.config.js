import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public', // default
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        description: resolve(__dirname, 'description.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // HackMD API sends no CORS headers, so the "存入HackMD" feature calls
      // /api/hackmd/* (same-origin) and the dev server forwards to the API.
      // Production mirrors this with the sidecar container (proxy/server.js).
      '/api/hackmd': {
        target: 'https://api.hackmd.io',
        changeOrigin: true,
        secure: false,
        headers: { Origin: 'https://hackmd.io' },
        rewrite: (path) => path.replace(/^\/api\/hackmd/, '/v1')
      }
    }
  }
});
