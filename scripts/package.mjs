// Zip each built target plus the license files into release/ (source maps excluded):
// noleaker-chrome-<version>.zip and noleaker-firefox-<version>.xpi (unsigned). Run `npm run package`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('release', { recursive: true });
for (const [target, ext] of [
  ['chrome', 'zip'],
  ['firefox', 'xpi'],
]) {
  const dir = `dist/${target}`;
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  if (manifest.version !== pkg.version)
    throw new Error(
      `Version mismatch: ${target} manifest ${manifest.version} vs package.json ${pkg.version}`,
    );
  const out = `${process.cwd()}/release/noleaker-${target}-${manifest.version}.${ext}`;
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-q', out, '.', '-x', '*.map', '-x', '.DS_Store'], { cwd: dir });
  execFileSync('zip', ['-q', '-j', out, 'LICENSE', 'THIRD_PARTY.md']);
  console.log(`packaged ${out}`);
}
