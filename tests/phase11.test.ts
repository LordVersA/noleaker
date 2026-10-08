import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIO_AMPLITUDE, installAudio } from '../src/content/audio';
import { installRects } from '../src/content/rects';
import {
  buildFingerprintConfig,
  NO_FINGERPRINT,
  type FingerprintConfig,
} from '../src/shared/fingerprint';
import { registrableDomain } from '../src/shared/registrable-domain';
import { DEFAULT_STATE } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const fp = (over: Partial<FingerprintConfig> = {}): FingerprintConfig => ({
  ...NO_FINGERPRINT,
  seed: 'p1',
  siteSeed: 'p1:example.com',
  ...over,
});

const newContext = (setup: string) => {
  const ctx = createContext({});
  runInContext(setup, ctx);
  return {
    g: runInContext('globalThis', ctx),
    run: <T = unknown>(code: string) => runInContext(code, ctx) as T,
  };
};

describe('registrableDomain', () => {
  it('finds eTLD+1', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com');
    expect(registrableDomain('a.b.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('Example.COM.')).toBe('example.com');
    expect(registrableDomain('shop.example.com.au')).toBe('example.com.au');
    expect(registrableDomain('example.com')).toBe('example.com');
  });
  it('leaves IPs, IPv6 and single labels alone', () => {
    expect(registrableDomain('192.168.1.5')).toBe('192.168.1.5');
    expect(registrableDomain('::1')).toBe('::1');
    expect(registrableDomain('localhost')).toBe('localhost');
  });
});

describe('buildFingerprintConfig: audio and layout flags', () => {
  const profile = { id: 'a', name: 'a', host: 'h.com', port: 1 };
  const state = (shields: Partial<State['shields']>): State => ({
    ...DEFAULT_STATE,
    profiles: [profile],
    activeProfileId: 'a',
    shields: { ...DEFAULT_STATE.shields, ...shields },
  });
  it('are off by default and follow their own switch only', () => {
    expect(buildFingerprintConfig(state({}))).toMatchObject({
      audioNoise: false,
      rectNoise: false,
    });
    expect(buildFingerprintConfig(state({ audio: true }))).toMatchObject({
      audioNoise: true,
      rectNoise: false,
      canvasNoise: false,
    });
    expect(buildFingerprintConfig(state({ clientRects: true }))).toMatchObject({
      audioNoise: false,
      rectNoise: true,
    });
  });
});

describe('audio noise', () => {
  const setup = `
    globalThis.AudioBuffer = class AudioBuffer {
      constructor(channels) { this.channels = channels; }
      getChannelData(c) { return this.channels[c]; }
      copyFromChannel(dest, c, offset = 0) {
        const src = this.channels[c];
        for (let i = 0; i < dest.length; i++) dest[i] = src[offset + i];
      }
    };
    globalThis.AnalyserNode = class AnalyserNode {
      getFloatFrequencyData(a) { a.set(this.freq); }
      getFloatTimeDomainData(a) { a.set(this.time); }
      getByteFrequencyData(a) { a.set(this.bytes); }
      getByteTimeDomainData(a) { a.set(this.bytes); }
    };
    globalThis.makeBuffer = () => new AudioBuffer([
      Float32Array.from({ length: 500 }, (_, i) => Math.sin(i / 7) * 0.5),
      new Float32Array(500),
    ]);
  `;
  let env: ReturnType<typeof newContext>;
  let audio: ReturnType<typeof installAudio>;
  beforeEach(() => {
    env = newContext(setup);
    audio = installAudio(env.g);
  });
  const original = () => env.run<number[]>('Array.from(makeBuffer().channels[0])');
  const read = (code: string) => env.run<number[]>(code);

  it('is untouched until enabled', () => {
    expect(read('Array.from(makeBuffer().getChannelData(0))')).toEqual(original());
    audio.setConfig(fp());
    expect(read('Array.from(makeBuffer().getChannelData(0))')).toEqual(original());
  });
  it('adds tiny, deterministic noise to getChannelData', () => {
    audio.setConfig(fp({ audioNoise: true }));
    const a = read('Array.from(makeBuffer().getChannelData(0))');
    const b = read('Array.from(makeBuffer().getChannelData(0))');
    expect(a).toEqual(b);
    const base = original();
    const diffs = a.map((v, i) => Math.abs(v - base[i]!));
    expect(Math.max(...diffs)).toBeLessThanOrEqual(AUDIO_AMPLITUDE * 1.01);
    expect(diffs.some((d) => d > 0)).toBe(true);
  });
  it('differs between sites and keeps silence silent', () => {
    audio.setConfig(fp({ audioNoise: true }));
    const siteA = read('Array.from(makeBuffer().getChannelData(0))');
    audio.setConfig(fp({ audioNoise: true, siteSeed: 'p1:other.org' }));
    const siteB = read('Array.from(makeBuffer().getChannelData(0))');
    expect(siteA).not.toEqual(siteB);
    expect(read('Array.from(makeBuffer().getChannelData(1))').every((v) => v === 0)).toBe(true);
    // zero samples inside a non-silent channel stay zero too
    expect(
      env.run<number>(
        '(() => { const b = makeBuffer(); b.channels[0][10] = 0; return b.getChannelData(0)[10]; })()',
      ),
    ).toBe(0);
  });
  it('does not add noise twice when getChannelData is called repeatedly', () => {
    audio.setConfig(fp({ audioNoise: true }));
    const once = read(
      '(() => { const b = makeBuffer(); b.getChannelData(0); return Array.from(b.getChannelData(0)); })()',
    );
    expect(once).toEqual(read('Array.from(makeBuffer().getChannelData(0))'));
  });
  it('copyFromChannel agrees with getChannelData, in either order', () => {
    audio.setConfig(fp({ audioNoise: true }));
    const viaGet = read('Array.from(makeBuffer().getChannelData(0))');
    const viaCopy = read(
      '(() => { const d = new Float32Array(500); makeBuffer().copyFromChannel(d, 0); return Array.from(d); })()',
    );
    expect(viaCopy).toEqual(viaGet);
    const afterGet = read(
      '(() => { const b = makeBuffer(); b.getChannelData(0); const d = new Float32Array(500); b.copyFromChannel(d, 0); return Array.from(d); })()',
    );
    expect(afterGet).toEqual(viaGet); // no double noise
    const offset = read(
      '(() => { const d = new Float32Array(100); makeBuffer().copyFromChannel(d, 0, 200); return Array.from(d); })()',
    );
    expect(offset).toEqual(viaGet.slice(200, 300)); // noise follows the absolute index
  });
  it('analyser: keeps silent bins, nudges the rest', () => {
    env.run(`
      globalThis.node = new AnalyserNode();
      node.freq = Float32Array.from([-Infinity, -50, -40, -Infinity, -30]);
      node.time = Float32Array.from([0, 0.2, -0.3, 0]);
      node.bytes = Uint8Array.from({ length: 400 }, (_, i) => (i % 4 === 0 ? 0 : 100));
    `);
    audio.setConfig(fp({ audioNoise: true }));
    const freq = read(
      '(() => { const a = new Float32Array(5); node.getFloatFrequencyData(a); return Array.from(a); })()',
    );
    expect(freq[0]).toBe(-Infinity);
    expect(freq[3]).toBe(-Infinity);
    expect(Math.abs(freq[1]! + 50)).toBeLessThanOrEqual(AUDIO_AMPLITUDE * 1.01);
    const time = read(
      '(() => { const a = new Float32Array(4); node.getFloatTimeDomainData(a); return Array.from(a); })()',
    );
    expect(time[0]).toBe(0);
    expect(time[3]).toBe(0);
    const bytes = read(
      '(() => { const a = new Uint8Array(400); node.getByteFrequencyData(a); return Array.from(a); })()',
    );
    expect(bytes.filter((_, i) => i % 4 === 0).every((v) => v === 0)).toBe(true);
    const changed = bytes.filter((v, i) => i % 4 !== 0 && v !== 100);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((v) => Math.abs(v - 100) === 1)).toBe(true);
    const mid = read(
      '(() => { node.bytes = new Uint8Array(400).fill(128); const a = new Uint8Array(400); node.getByteTimeDomainData(a); return Array.from(a); })()',
    );
    expect(mid.every((v) => v === 128)).toBe(true); // time-domain silence is 128
  });
  it('keeps patched methods native-looking', () => {
    expect(env.run('Function.prototype.toString.call(AudioBuffer.prototype.getChannelData)')).toBe(
      'function getChannelData() { [native code] }',
    );
  });
});

describe('layout noise', () => {
  const setup = `
    globalThis.DOMRect = class DOMRect {
      constructor(x, y, w, h) { this._ = { x, y, width: w, height: h }; }
      get x() { return this._.x; } set x(v) { this._.x = v; }
      get y() { return this._.y; } set y(v) { this._.y = v; }
      get width() { return this._.width; } set width(v) { this._.width = v; }
      get height() { return this._.height; } set height(v) { this._.height = v; }
      get left() { return this._.x; } get top() { return this._.y; }
      get right() { return this._.x + this._.width; } get bottom() { return this._.y + this._.height; }
    };
    globalThis.DOMRectList = class DOMRectList {
      constructor(rects) { rects.forEach((r, i) => (this[i] = r)); this.length = rects.length; }
      item(i) { return this[i] ?? null; }
    };
    globalThis.Element = class Element {
      getBoundingClientRect() { return new DOMRect(10.1, 20.5, 100.7, 30); }
      getClientRects() { return new DOMRectList([new DOMRect(1.3, 2, 3.7, 4), new DOMRect(0, 0, 50, 50)]); }
    };
    globalThis.Range = class Range { getBoundingClientRect() { return new DOMRect(5.9, 5.9, 5.9, 5.9); } };
    globalThis.SVGGraphicsElement = class SVGGraphicsElement { getBBox() { return new DOMRect(1.1, 2.2, 3.3, 4.4); } };
    globalThis.SVGTextContentElement = class SVGTextContentElement {
      getComputedTextLength() { return 77.7; }
      getSubStringLength() { return 12.34; }
    };
    globalThis.TextMetrics = class TextMetrics {
      get width() { return 123.456; }
      get actualBoundingBoxLeft() { return 0; }
      get fontBoundingBoxAscent() { return 11.1; }
    };
  `;
  let env: ReturnType<typeof newContext>;
  let rects: ReturnType<typeof installRects>;
  const STEP = 1 / 64;
  beforeEach(() => {
    env = newContext(setup);
    rects = installRects(env.g);
  });
  const rect = (code = 'new Element().getBoundingClientRect()') =>
    env.run<{ x: number; y: number; width: number; height: number; right: number }>(
      `(() => { const r = ${code}; return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; })()`,
    );

  it('is untouched until enabled', () => {
    expect(rect()).toMatchObject({ x: 10.1, y: 20.5, width: 100.7, height: 30 });
    rects.setConfig(fp());
    expect(rect()).toMatchObject({ x: 10.1, width: 100.7 });
  });
  it('moves values by at most 1/64 px and leaves multiples of 1/4 alone', () => {
    rects.setConfig(fp({ rectNoise: true }));
    const r = rect();
    expect(r.y).toBe(20.5); // multiple of 1/4
    expect(r.height).toBe(30);
    expect(Math.abs(r.x - 10.1)).toBeLessThanOrEqual(STEP);
    expect(Math.abs(r.width - 100.7)).toBeLessThanOrEqual(STEP);
    expect(r.x).not.toBe(10.1);
    expect(r.right).toBeCloseTo(r.x + r.width, 10); // derived fields stay consistent
  });
  it('is deterministic per site and differs between sites', () => {
    rects.setConfig(fp({ rectNoise: true }));
    expect(rect()).toEqual(rect());
    const a = rect();
    rects.setConfig(fp({ rectNoise: true, siteSeed: 'p1:other.org' }));
    expect(rect()).not.toEqual(a);
  });
  it('keeps getClientRects a real list and nudges every item', () => {
    rects.setConfig(fp({ rectNoise: true }));
    expect(env.run('new Element().getClientRects() instanceof DOMRectList')).toBe(true);
    expect(env.run('new Element().getClientRects().item(1).width')).toBe(50); // untouched multiple
    const first = env.run<number>('new Element().getClientRects().item(0).x');
    expect(first).not.toBe(1.3);
    expect(Math.abs(first - 1.3)).toBeLessThanOrEqual(STEP);
    expect(env.run('new Element().getClientRects().length')).toBe(2);
  });
  it('covers Range and SVG getBBox', () => {
    rects.setConfig(fp({ rectNoise: true }));
    expect(rect('new Range().getBoundingClientRect()').x).not.toBe(5.9);
    expect(rect('new SVGGraphicsElement().getBBox()').width).not.toBe(3.3);
  });
  it('nudges text metrics and SVG text lengths', () => {
    rects.setConfig(fp({ rectNoise: true }));
    const [w, left, ascent, len, sub] = env.run<number[]>(
      '[new TextMetrics().width, new TextMetrics().actualBoundingBoxLeft, new TextMetrics().fontBoundingBoxAscent, new SVGTextContentElement().getComputedTextLength(), new SVGTextContentElement().getSubStringLength()]',
    );
    expect(w).not.toBe(123.456);
    expect(Math.abs(w! - 123.456)).toBeLessThanOrEqual(STEP);
    expect(left).toBe(0);
    expect(Math.abs(ascent! - 11.1)).toBeLessThanOrEqual(STEP);
    expect(Math.abs(len! - 77.7)).toBeLessThanOrEqual(STEP);
    expect(Math.abs(sub! - 12.34)).toBeLessThanOrEqual(STEP);
    rects.setConfig(fp());
    expect(env.run('new TextMetrics().width')).toBe(123.456);
  });
  it('keeps patched methods and getters native-looking', () => {
    expect(
      env.run('Function.prototype.toString.call(Element.prototype.getBoundingClientRect)'),
    ).toBe('function getBoundingClientRect() { [native code] }');
    expect(
      env.run(
        "Function.prototype.toString.call(Object.getOwnPropertyDescriptor(TextMetrics.prototype, 'width').get)",
      ),
    ).toBe('function get width() { [native code] }');
  });
});
