// Zip dist/ plus the license files into release/noleaker-<version>.zip (source maps excluded).
// Run `npm run package`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`);
}

mkdirSync('release', { recursive: true });
const out = `${process.cwd()}/release/noleaker-${manifest.version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', out, '.', '-x', '*.map', '-x', '.DS_Store'], { cwd: 'dist' });
execFileSync('zip', ['-q', '-j', out, 'LICENSE', 'THIRD_PARTY.md']);
console.log(`packaged ${out}`);
