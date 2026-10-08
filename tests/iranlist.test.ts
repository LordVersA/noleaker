import { MAX_LIST_CHARS } from '../src/background/iranlist';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hostMatches, normalizeDomain, parseDomainLines } from '../src/shared/domains';
import { countGroups, decodeGroups, encodeGroups, parseDomainList } from '../src/shared/iranlist';
import { generatePac } from '../src/shared/pac';

const profile = { id: '1', name: 'p', host: 'proxy.example', port: 1080 };
const find = (pac: string, host: string) =>
  new Function(`${pac}; return FindProxyForURL;`)()(`http://${host}/`, host);

describe('normalizeDomain / hostMatches', () => {
  it('normalizes common inputs', () => {
    expect(normalizeDomain(' HTTPS://www.Example.com:8080/a?b ')).toBe('www.example.com');
    expect(normalizeDomain('*.example.com')).toBe('example.com');
    expect(normalizeDomain('.example.com.')).toBe('example.com');
  });
  it('rejects junk', () => {
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('a..b')).toBeNull();
  });
  it('matches the domain and its subdomains only', () => {
    expect(hostMatches('a.b.example.com', ['example.com'])).toBe(true);
    expect(hostMatches('example.com', ['example.com'])).toBe(true);
    expect(hostMatches('notexample.com', ['example.com'])).toBe(false);
  });
  it('parses textarea input', () => {
    expect(parseDomainLines('a.com\n b.com, c.com\nbad domain\n\na.com')).toEqual({
      domains: ['a.com', 'b.com', 'c.com'],
      invalid: ['bad domain'],
    });
  });
});

describe('domain list encoding', () => {
  const domains = ['digikala.com', 'digikala-shop.com', 'digi.net', 'a.co.uk', 'abc.xyz'];
  it('round-trips', () => {
    const groups = encodeGroups(domains);
    expect(decodeGroups(groups).sort()).toEqual([...domains].sort());
    expect(countGroups(groups)).toBe(domains.length);
  });
  it('parses upstream text, keeping .ir entries and dropping comments and junk', () => {
    expect(parseDomainList('# c\nfoo.ir\n.Bar.com\nbad_\n\nbaz.net\nbar.com')).toEqual([
      'foo.ir',
      'bar.com',
      'baz.net',
    ]);
  });
});

describe('PAC with the Iran list', () => {
  const pac = generatePac(profile, {
    iranGroups: encodeGroups(['digikala.com', 'shop.co.uk']),
    extraDirect: ['mysite.org'],
  });
  it('sends listed domains and their subdomains direct', () => {
    for (const h of [
      'digikala.com',
      'www.digikala.com',
      'a.b.digikala.com',
      'shop.co.uk',
      'mysite.org',
      'x.mysite.org',
    ])
      expect(find(pac, h), h).toBe('DIRECT');
  });
  it('proxies everything else', () => {
    for (const h of ['example.com', 'notdigikala.com', 'digikala.com.evil.net', 'co.uk'])
      expect(find(pac, h), h).toBe('SOCKS5 proxy.example:1080');
  });
  it('keeps the list direct while the kill switch blocks', () => {
    const blocking = generatePac(profile, {
      blocking: true,
      iranGroups: encodeGroups(['digikala.com']),
    });
    expect(find(blocking, 'digikala.com')).toBe('DIRECT');
    expect(find(blocking, 'example.com')).toBe('PROXY 127.0.0.1:1');
  });
});

describe('bundled snapshot', () => {
  const snapshot = JSON.parse(readFileSync('public/data/iran-domains.json', 'utf8'));
  it('is consistent and fits comfortably in a PAC script', () => {
    expect(countGroups(snapshot.groups)).toBe(snapshot.count);
    expect(snapshot.count).toBeGreaterThan(10_000);
    const pac = generatePac(profile, {
      blocking: true,
      iranGroups: snapshot.groups,
      extraDirect: ['a.com'],
    });
    // Chrome 155 was verified to apply a 891 KB script with the full list, `.ir` entries included.
    expect(pac.length).toBeLessThan(MAX_LIST_CHARS);
  });
  it('routes real listed domains direct and others via the proxy', () => {
    const pac = generatePac(profile, { iranGroups: snapshot.groups });
    const sample = decodeGroups(snapshot.groups).slice(0, 2000);
    for (const d of sample) expect(find(pac, d), d).toBe('DIRECT');
    expect(find(pac, 'google.com')).toBe('SOCKS5 proxy.example:1080');
  });
});
