// Minimal SOCKS5 server (no auth) for testing noleaker locally. It logs every CONNECT so you can
// see that Chrome sends domain names (remote DNS) instead of resolving them itself.
// Usage: node scripts/socks5-server.mjs [port] [host]     (default 1080 on 127.0.0.1)
import net from 'node:net';
import { pathToFileURL } from 'node:url';

export function createSocksServer({ log = () => {} } = {}) {
  return net.createServer((client) => {
    client.on('error', () => client.destroy());
    let stage = 'greeting';
    let buffer = Buffer.alloc(0);

    client.on('data', function onData(chunk) {
      if (stage === 'piping') return;
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === 'greeting') {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        const version = buffer[0];
        const methods = [...buffer.subarray(2, 2 + buffer[1])];
        buffer = buffer.subarray(2 + buffer[1]);
        if (version !== 5 || !methods.includes(0)) {
          client.end(Buffer.from([5, 0xff]));
          return;
        }
        client.write(Buffer.from([5, 0]));
        stage = 'request';
        if (buffer.length === 0) return;
      }

      if (stage === 'request') {
        if (buffer.length < 5) return;
        const atyp = buffer[3];
        let host;
        let end;
        if (atyp === 1) {
          end = 4 + 4;
          if (buffer.length < end + 2) return;
          host = [...buffer.subarray(4, 8)].join('.');
        } else if (atyp === 3) {
          end = 5 + buffer[4];
          if (buffer.length < end + 2) return;
          host = buffer.subarray(5, end).toString();
        } else if (atyp === 4) {
          end = 4 + 16;
          if (buffer.length < end + 2) return;
          host = Array.from({ length: 8 }, (_, i) =>
            buffer.readUInt16BE(4 + i * 2).toString(16),
          ).join(':');
        } else {
          client.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
          return;
        }
        const port = buffer.readUInt16BE(end);
        const rest = buffer.subarray(end + 2);
        if (buffer[1] !== 1) {
          client.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0]));
          return;
        }
        stage = 'piping';
        client.removeListener('data', onData);
        log(`CONNECT ${atyp === 3 ? 'domain' : 'ip'} ${host}:${port}`);
        const upstream = net.connect(port, host);
        upstream.on('error', () => {
          if (!client.destroyed) client.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
          upstream.destroy();
        });
        upstream.on('connect', () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (rest.length) upstream.write(rest);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        client.on('close', () => upstream.destroy());
      }
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2] ?? 1080);
  const host = process.argv[3] ?? '127.0.0.1';
  createSocksServer({ log: (m) => console.log(new Date().toISOString(), m) }).listen(
    port,
    host,
    () => console.log(`SOCKS5 listening on ${host}:${port}`),
  );
}
