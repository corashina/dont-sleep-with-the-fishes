import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: '/files/',
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: resolve(root, 'index.html'),
      output: {
        entryFileNames: 'board.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
