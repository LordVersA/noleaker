import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES_UI } from '../src/shared/i18n';

const dict = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
const html = ['options', 'popup', 'leaktest']
  .map((p) => readFileSync(`src/${p}/index.html`, 'utf8'))
  .join('\n')
  .replace(/\s+/g, ' ');

describe('UI translations', () => {
  const langs = Object.keys(LANGUAGES_UI).filter((l) => l !== 'en');
  const keys = Object.keys(dict('fa')).sort();

  it('every language translates the same strings, none empty', () => {
    for (const lang of langs) {
      const d = dict(lang);
      expect(Object.keys(d).sort(), lang).toEqual(keys);
      for (const k of keys) expect(d[k], `${lang}: ${k}`).not.toBe('');
    }
  });
  it('covers the main page headings', () => {
    for (const heading of ['Privacy mode', 'Audit this tab', 'Proxies', 'Leak test']) {
      expect(html).toContain(heading);
      expect(keys).toContain(heading);
    }
  });
});
