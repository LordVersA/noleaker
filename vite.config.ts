import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Multi-entry build for an MV3 extension. `src` is the root so HTML pages land at
// dist/popup/index.html and dist/options/index.html; manifest.json is copied from public/.
export default defineConfig(({ mode }) => ({
  root: 'src',
  publicDir: resolve(import.meta.dirname, 'public'),
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: process.env.NOLEAKER_WATCH !== '1',
    target: 'chrome120',
    minify: mode === 'development' ? false : 'oxc',
    cssMinify: mode === 'development' ? false : 'lightningcss',
    sourcemap: mode === 'development',
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
        popup: resolve(import.meta.dirname, 'src/popup/index.html'),
        options: resolve(import.meta.dirname, 'src/options/index.html'),
        leaktest: resolve(import.meta.dirname, 'src/leaktest/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    root: resolve(import.meta.dirname),
    include: ['tests/**/*.test.ts'],
  },
}));
