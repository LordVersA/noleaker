import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { alias, define, esTarget, manifest, outDir } from './vite.target.ts';

// Multi-entry build for an MV3 extension. `src` is the root so HTML pages land at
// dist/<target>/popup/index.html etc.; manifest.json comes from manifests/manifest.<target>.json.
export default defineConfig(({ mode }) => ({
  root: 'src',
  publicDir: resolve(import.meta.dirname, 'public'),
  base: './',
  resolve: { alias },
  define,
  plugins: [manifest()],
  build: {
    outDir,
    emptyOutDir: process.env.NOLEAKER_WATCH !== '1',
    target: esTarget,
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
