import { describe, expect, it } from 'vitest';
import { generatePac } from '../src/platform/chrome/pac';
import { encodeGroups } from '../src/shared/iranlist';
import { directLookup, route, type Route } from '../src/shared/route';

const profile = { id: '1', name: 'p', host: 'proxy.example', port: 1080 };
const HOSTS = [
  'example.com',
  'EXAMPLE.com.',
  '8.8.8.8',
  '172.32.0.1',
  'localhost',
  'a.localhost',
  'nas',
  'printer.local',
  '127.0.0.1',
  '10.1.2.3',
  '192.168.1.5',
  '172.16.0.1',
  '169.254.1.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '::',
  'fe80::1',
  'fd00::1',
  '::ffff:1.2.3.4',
  '2001:db8::1',
  'digikala.ir',
  'mine.ir',
  'www.mine.ir',
  'site.com',
  'a.b.site.com',
  'listed.ir',
  'www.listed.ir',
  'other.ir',
  'notir.com',
  'example.ir.com',
  'cloudflare.com',
  'ipwho.is',
  'www.cloudflare.com',
  'ir',
];
const iran = ['site.com', 'listed.ir'];
const extra = ['mine.ir', 'ir.example'];

function pacRoute(result: string): Route {
  if (result === 'DIRECT') return 'direct';
  if (result === 'PROXY 127.0.0.1:1') return 'block';
  expect(result).toBe('SOCKS5 proxy.example:1080');
  return 'proxy';
}

describe('route() matches the Chrome PAC script', () => {
  for (const blocking of [false, true])
    for (const strict of [false, true])
      it(`blocking=${blocking} strict=${strict}`, () => {
        const pac = generatePac(profile, {
          blocking,
          strict,
          iranGroups: strict ? {} : encodeGroups(iran),
          extraDirect: extra,
        });
        const find = new Function(`${pac}; return FindProxyForURL;`)();
        const direct = directLookup(strict ? {} : encodeGroups(iran), extra);
        for (const host of HOSTS)
          expect(route(host, { blocking, strict, direct }), host).toBe(
            pacRoute(find(`http://${host}/`, host)),
          );
      });
});
