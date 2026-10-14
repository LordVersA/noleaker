import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Shared by both Vite configs. NOLEAKER_TARGET=chrome|firefox picks the platform code behind
// `@platform/*`, the manifest and the output folder (dist/<target>). Default: chrome.
export type Target = 'chrome' | 'firefox';

export const target: Target = process.env.NOLEAKER_TARGET === 'firefox' ? 'firefox' : 'chrome';
if (!['chrome', 'firefox', undefined].includes(process.env.NOLEAKER_TARGET))
  throw new Error(`Unknown NOLEAKER_TARGET: ${process.env.NOLEAKER_TARGET}`);

export const outDir = resolve(import.meta.dirname, 'dist', target);
export const esTarget = target === 'firefox' ? 'firefox140' : 'chrome120';

export const alias = { '@platform': resolve(import.meta.dirname, 'src/platform', target) };

export const define = {
  __BROWSER__: JSON.stringify(target),
};

/** Emits manifests/manifest.<target>.json as manifest.json. */
export function manifest(): Plugin {
  const file = resolve(import.meta.dirname, 'manifests', `manifest.${target}.json`);
  return {
    name: 'noleaker-manifest',
    buildStart() {
      this.addWatchFile(file);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: readFileSync(file, 'utf8'),
      });
    },
  };
}
