// Production build of one target: node scripts/build.mjs chrome|firefox → dist/<target>/.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const target = process.argv[2];
if (target !== 'chrome' && target !== 'firefox') throw new Error('usage: build.mjs chrome|firefox');
const vite = resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js');
const env = { ...process.env, NOLEAKER_TARGET: target };
const builds = [
  ['--config', 'vite.config.ts'],
  ...['main', 'bridge', 'worker'].map((mode) => [
    '--config',
    'vite.content.config.ts',
    '--mode',
    mode,
  ]),
];
for (const args of builds)
  execFileSync(process.execPath, [vite, 'build', ...args], { env, stdio: 'inherit' });
