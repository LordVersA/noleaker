import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import baseline from './bundle-baseline.json';

function jsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return path.endsWith('.js') ? [path] : [];
  });
}
const read = (dir: string) => jsFiles(dir).map((f) => readFileSync(f, 'utf8'));

describe.skipIf(!existsSync('dist/chrome/background.js'))('Chrome bundle', () => {
  it('is not larger than the recorded baseline', () => {
    const bytes = jsFiles('dist/chrome').reduce((n, f) => n + statSync(f).size, 0);
    expect(bytes).toBeLessThanOrEqual(baseline.chromeJsBytes);
  });
  it('ships the PAC proxy and DNR guard, and no Firefox routing', () => {
    const bg = readFileSync('dist/chrome/background.js', 'utf8');
    expect(bg).toContain('pac_script');
    expect(bg).toContain('onProxyError');
    expect(read('dist/chrome').join('\n')).not.toContain('onRequest');
  });
  it('uses the Chrome manifest', () => {
    const manifest = JSON.parse(readFileSync('dist/chrome/manifest.json', 'utf8'));
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.browser_specific_settings).toBeUndefined();
  });
});

describe.skipIf(!existsSync('dist/firefox/background.js'))('Firefox bundle', () => {
  it('contains no Chrome PAC or proxy-settings code', () => {
    const bg = readFileSync('dist/firefox/background.js', 'utf8');
    for (const s of ['pac_script', 'FindProxyForURL', 'onProxyError', 'proxy.settings'])
      expect(bg, s).not.toContain(s);
  });
  it('uses the Firefox manifest', () => {
    const manifest = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
    expect(manifest.background.scripts).toEqual(['background.js']);
    expect(manifest.browser_specific_settings.gecko.id).toBe('noleaker@lordversa.github.io');
  });
});
