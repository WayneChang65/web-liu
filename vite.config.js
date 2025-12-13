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
    open: true
  }
});
