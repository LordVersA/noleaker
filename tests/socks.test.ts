import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { createSocksServer } from '../scripts/socks5-server.mjs';

let web: http.Server;
let socks: net.Server;
const logged: string[] = [];

const listen = (server: net.Server) =>
  new Promise<number>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', fail);
      resolve((server.address() as AddressInfo).port);
    });
  });

beforeAll(async () => {
  web = http.createServer((_req, res) => res.end('hello through socks'));
  socks = createSocksServer({ log: (m: string) => logged.push(m) });
});
afterAll(() => {
  web.close();
  socks.close();
});

/** Speak SOCKS5 by hand, like Chrome does, then send an HTTP request through the tunnel. */
async function fetchViaSocks(socksPort: number, request: Buffer, httpPort: number) {
  return new Promise<string>((resolve, reject) => {
    const s = net.connect(socksPort, '127.0.0.1');
    let stage = 0;
    let body = '';
    s.on('error', reject);
    s.on('data', (d) => {
      if (stage === 0) {
        expect([...d]).toEqual([5, 0]);
        stage = 1;
        s.write(request);
      } else if (stage === 1) {
        expect(d[1]).toBe(0);
        stage = 2;
        s.write(`GET / HTTP/1.0\r\nHost: x:${httpPort}\r\n\r\n`);
      } else {
        body += d.toString();
      }
    });
    s.on('close', () => resolve(body));
    s.write(Buffer.from([5, 1, 0]));
  });
}

describe('test SOCKS5 server', () => {
  it('tunnels a request and receives the domain name (remote DNS)', async () => {
    const httpPort = await listen(web);
    const socksPort = await listen(socks);
    const name = Buffer.from('localhost');
    const port = Buffer.alloc(2);
    port.writeUInt16BE(httpPort);
    const req = Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, port]);
    const body = await fetchViaSocks(socksPort, req, httpPort);
    expect(body).toContain('hello through socks');
    expect(logged).toContain(`CONNECT domain localhost:${httpPort}`);
  });

  it('refuses SOCKS4 clients', async () => {
    const server = createSocksServer();
    try {
      const port = await listen(server);
      const reply = await new Promise<number[]>((resolve, reject) => {
        const s = net.connect(port, '127.0.0.1', () =>
          s.write(Buffer.from([4, 1, 0, 80, 1, 2, 3, 4, 0])),
        );
        s.on('error', reject);
        s.on('data', (d: Buffer) => {
          resolve([...d]);
          s.destroy();
        });
      });
      expect(reply).toEqual([5, 0xff]);
    } finally {
      server.close();
    }
  });
});
