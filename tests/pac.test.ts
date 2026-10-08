import { describe, expect, it } from 'vitest';
import { encodeGroups } from '../src/shared/iranlist';
import { generatePac } from '../src/shared/pac';

const find = (host: string, profile = { id: '1', name: 'p', host: 'proxy.example', port: 1080 }) =>
  new Function(`${generatePac(profile)}; return FindProxyForURL;`)()(`http://${host}/`, host);

const profile = { id: '1', name: 'p', host: 'proxy.example', port: 1080 };

describe('generatePac', () => {
  it('proxies normal sites via SOCKS5', () => {
    expect(find('example.com')).toBe('SOCKS5 proxy.example:1080');
    expect(find('8.8.8.8')).toBe('SOCKS5 proxy.example:1080');
    expect(find('172.32.0.1')).toBe('SOCKS5 proxy.example:1080');
  });
  it('sends localhost, plain and private hosts direct', () => {
    for (const h of [
      'localhost',
      'a.localhost',
      'nas',
      'printer.local',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.5',
      '172.16.0.1',
      '172.31.9.9',
      '169.254.1.1',
      '::1',
      '[::1]',
      'fe80::1',
      'fd00::1',
    ])
      expect(find(h), h).toBe('DIRECT');
  });
  it('has no blanket rule for .ir: those sites use the proxy unless listed', () => {
    for (const h of ['digikala.ir', 'shop.example.ir']) {
      expect(find(h), h).toBe('SOCKS5 proxy.example:1080');
    }
    const withList = (host: string) =>
      new Function(
        `${generatePac(profile, { extraDirect: ['mine.ir'], iranGroups: encodeGroups(['site.com', 'listed.ir']) })}; return FindProxyForURL;`,
      )()(`http://${host}/`, host);
    expect(withList('mine.ir')).toBe('DIRECT'); // your own entry still works
    expect(withList('www.mine.ir')).toBe('DIRECT');
    expect(withList('site.com')).toBe('DIRECT'); // the Iran list still works
    expect(withList('listed.ir')).toBe('DIRECT'); // a listed .ir domain is direct
    expect(withList('www.listed.ir')).toBe('DIRECT');
    expect(withList('other.ir')).toBe('SOCKS5 proxy.example:1080');
  });
  it('does not match lookalike domains', () => {
    expect(find('notir.com')).toBe('SOCKS5 proxy.example:1080');
    expect(find('example.ir.com')).toBe('SOCKS5 proxy.example:1080');
  });
  it('brackets IPv6 proxy hosts', () => {
    expect(find('example.com', { id: '1', name: 'p', host: '::1', port: 9 })).toBe(
      'SOCKS5 [::1]:9',
    );
  });
});

describe('generatePac blocking (kill switch)', () => {
  const profile = { id: '1', name: 'p', host: 'proxy.example', port: 1080 };
  const block = (host: string) =>
    new Function(`${generatePac(profile, { blocking: true })}; return FindProxyForURL;`)()(
      `http://${host}/`,
      host,
    );
  it('refuses normal sites but keeps direct hosts direct', () => {
    expect(block('example.com')).toBe('PROXY 127.0.0.1:1');
    expect(block('digikala.ir')).toBe('PROXY 127.0.0.1:1'); // no blanket .ir rule
    expect(block('localhost')).toBe('DIRECT');
    expect(block('192.168.1.1')).toBe('DIRECT');
  });
  it('still routes probe hosts through the proxy', () => {
    expect(block('cloudflare.com')).toBe('SOCKS5 proxy.example:1080');
    expect(block('ipwho.is')).toBe('SOCKS5 proxy.example:1080');
  });
});
