import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('release metadata', () => {
  it('manifest and package versions match', () => {
    expect(manifest.version).toBe(pkg.version);
  });
  it('every icon in the manifest exists', () => {
    const files = [
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    for (const f of files as string[]) expect(existsSync(`public/${f}`), f).toBe(true);
  });
  it('requests only the permissions the code uses', () => {
    expect([...manifest.permissions].sort()).toEqual(
      [
        'alarms',
        'declarativeNetRequest',
        'privacy',
        'proxy',
        'scripting',
        'storage',
        'webNavigation',
      ].sort(),
    );
  });
  it('ships the bundled Iran list', () => {
    expect(existsSync('public/data/iran-domains.json')).toBe(true);
  });
});
