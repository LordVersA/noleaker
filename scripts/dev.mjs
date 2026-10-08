// Build once, then watch each bundle in its own Vite process.
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const vite = resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js');
const builds = [
  ['--config', 'vite.config.ts', '--mode', 'development'],
  ...['main', 'bridge', 'worker', 'flow'].map((mode) => [
    '--config',
    'vite.content.config.ts',
    '--mode',
    mode,
  ]),
];
const env = { ...process.env, NOLEAKER_DEV: '1' };
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

try {
  // Initial clean build guarantees every script exists before loading the extension.
  for (const args of builds) {
    execFileSync(process.execPath, [vite, 'build', ...args], { env, stdio: 'inherit' });
  }
  for (const args of builds) {
    const child = spawn(process.execPath, [vite, 'build', ...args, '--watch'], {
      env: { ...env, NOLEAKER_WATCH: '1' },
      stdio: 'inherit',
    });
    children.add(child);
    child.on('error', (error) => {
      console.error(error);
      stop(1);
    });
    child.on('exit', () => {
      children.delete(child);
      if (!stopping) stop(1);
    });
  }
  console.log(
    'Watching UI, background, main, bridge, worker and Flow. Reload the extension after changes.',
  );
} catch (error) {
  console.error(error);
  stop(1);
}
