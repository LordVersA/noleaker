import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { alias, define, esTarget, outDir } from './vite.target.ts';

// Content scripts are classic scripts, so each one is built on its own as a self-contained IIFE.
// Usage: vite build -c vite.content.config.ts --mode main|bridge|worker|flow
// (`flow` is the Google Flow unlock, which lives in src/flow/ and is registered by the service
// worker only while its switch is on.)
export default defineConfig(({ mode }) => ({
  publicDir: false,
  resolve: { alias },
  define,
  build: {
    outDir,
    emptyOutDir: false,
    target: esTarget,
    minify: process.env.NOLEAKER_DEV === '1' ? false : 'oxc',
    sourcemap: process.env.NOLEAKER_DEV === '1',
    lib: {
      entry: resolve(
        import.meta.dirname,
        `${mode === 'flow' ? 'src/flow/page.ts' : `src/content/${mode}.ts`}`,
      ),
      formats: ['iife'],
      name: `noleaker_${mode}`,
      fileName: () => `content/${mode}.js`,
    },
  },
}));
