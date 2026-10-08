// Generates public/icons/icon{16,32,48,128}.png: the noleaker mark (a shield outline with a
// droplet, see src/shared/brand.ts) on a navy rounded tile with a soft blue glow.
// Pure Node (zlib), no image libraries. Usage: node scripts/make-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling for smooth edges
const TOP = [28, 42, 74];
const BOTTOM = [11, 18, 38];
const BORDER = [42, 58, 84];
const BLUE = [77, 141, 255];
const LIGHT = [156, 194, 255];

// The shield centre line (the same path as SHIELD_PATH, curves flattened) and the droplet, in a
// 100x100 box. Keep in step with src/shared/brand.ts.
const STROKE = 10;
function cubic(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const k = 1 - t;
    out.push([
      k * k * k * p0[0] + 3 * k * k * t * p1[0] + 3 * k * t * t * p2[0] + t * t * t * p3[0],
      k * k * k * p0[1] + 3 * k * k * t * p1[1] + 3 * k * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}
const SHIELD = [
  [50, 5],
  [85, 17],
  [85, 50],
  ...cubic([85, 50], [85, 71], [69, 85], [50, 95]),
  ...cubic([50, 95], [31, 85], [15, 71], [15, 50]),
  [15, 17],
  [50, 5],
];
const DROP_TIP = [50, 38];
const DROP_C = [50, 55];
const DROP_R = 7.5;
const DROP_TRI = [DROP_TIP, [43.27, 51.69], [56.73, 51.69]];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Distance from point to segment. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function shieldDist(x, y) {
  let d = Infinity;
  for (let i = 1; i < SHIELD.length; i++) {
    d = Math.min(d, segDist(x, y, SHIELD[i - 1][0], SHIELD[i - 1][1], SHIELD[i][0], SHIELD[i][1]));
  }
  return d;
}

function inTriangle(x, y, [a, b, c]) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([x, y], a, b);
  const d2 = s([x, y], b, c);
  const d3 = s([x, y], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function sample(u, v, size) {
  // rounded square tile; corners stay transparent
  const r = 0.22;
  const cx = Math.max(r, Math.min(1 - r, u));
  const cy = Math.max(r, Math.min(1 - r, v));
  if (Math.hypot(u - cx, v - cy) > r) return null;
  const edge =
    Math.hypot(u - cx, v - cy) > r - 0.03 || u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97;

  // map to the 100x100 mark box; small sizes get a bigger mark so it stays readable
  const f = size <= 16 ? 0.8 : size <= 32 ? 0.72 : 0.58;
  const x = ((u - 0.5) / f) * 100 + 50;
  const y = ((v - 0.5) / f) * 100 + 50;

  const dShield = shieldDist(x, y);
  const stroke = dShield <= STROKE / 2;
  const drop = Math.hypot(x - DROP_C[0], y - DROP_C[1]) <= DROP_R || inTriangle(x, y, DROP_TRI);
  if (stroke || drop) {
    // a lighter top-left, like a light source
    return mix(BLUE, LIGHT, Math.max(0, 0.55 - (x + y) / 200) * 0.9);
  }
  const bg = edge ? BORDER : mix(TOP, BOTTOM, v);
  if (size >= 48 && !edge) {
    const out = dShield - STROKE / 2;
    if (out > 0 && out < 14) return mix(bg, BLUE, 0.4 * (1 - out / 14) ** 2);
  }
  return bg;
}

function crc32(buf) {
  let c;
  let crc = ~0;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, size);
          if (px) {
            r += px[0];
            g += px[1];
            b += px[2];
            a++;
          }
        }
      }
      const o = 1 + x * 4;
      if (a) [row[o], row[o + 1], row[o + 2]] = [r / a, g / a, b / a].map(Math.round);
      row[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const size of SIZES) await writeFile(new URL(`icon${size}.png`, dir), png(size));
console.log(`wrote icons: ${SIZES.join(', ')}`);
