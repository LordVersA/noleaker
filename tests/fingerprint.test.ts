import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { GPU_MODELS } from '../src/shared/gpus';
import { addCanvasNoise, installFingerprint, osOf } from '../src/content/fingerprint';
import {
  buildFingerprintConfig,
  CORE_COUNTS,
  type FingerprintConfig,
  hashString,
  MEMORY_SIZES,
  NO_FINGERPRINT,
  pick,
} from '../src/shared/fingerprint';
import { DEFAULT_STATE } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const profile = { id: 'profile-1', name: 'p', host: 'h.com', port: 1 };
const state = (shields: Partial<State['shields']>): State => ({
  ...DEFAULT_STATE,
  profiles: [profile],
  activeProfileId: 'profile-1',
  shields: { ...DEFAULT_STATE.shields, ...shields },
});

describe('buildFingerprintConfig', () => {
  it('is all off by default', () => {
    expect(buildFingerprintConfig(state({}))).toMatchObject({
      canvasNoise: false,
      webglSpoof: false,
      screenSpoof: false,
      hardwareConcurrency: null,
      deviceMemory: null,
    });
  });
  it('has nothing without a profile', () => {
    expect(buildFingerprintConfig(DEFAULT_STATE)).toEqual(NO_FINGERPRINT);
  });
  it('is stable per profile and plausible', () => {
    const a = buildFingerprintConfig(state({ hardwareConcurrency: true, deviceMemory: true }));
    const b = buildFingerprintConfig(state({ hardwareConcurrency: true, deviceMemory: true }));
    expect(a).toEqual(b);
    expect(CORE_COUNTS).toContain(a.hardwareConcurrency);
    expect(MEMORY_SIZES).toContain(a.deviceMemory);
  });
  it('each toggle only sets its own value', () => {
    const cores = buildFingerprintConfig(state({ hardwareConcurrency: true }));
    expect(cores.deviceMemory).toBeNull();
    expect(cores.canvasNoise).toBe(false);
    const mem = buildFingerprintConfig(state({ deviceMemory: true }));
    expect(mem.hardwareConcurrency).toBeNull();
  });
  it('different profiles spread over the pool', () => {
    const picks = new Set(
      Array.from({ length: 40 }, (_, i) => pick(CORE_COUNTS, `profile-${i}`, 'cores')),
    );
    expect(picks.size).toBeGreaterThan(2);
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('addCanvasNoise', () => {
  const pixels = () => new Uint8ClampedArray(4 * 1000).map((_, i) => (i % 4 === 3 ? 255 : 120));
  it('is deterministic per seed and differs between seeds', () => {
    const a = pixels(),
      b = pixels(),
      c = pixels();
    addCanvasNoise(a, 'seed-1');
    addCanvasNoise(b, 'seed-1');
    addCanvasNoise(c, 'seed-2');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('only flips the lowest bit and never alpha', () => {
    const base = pixels();
    const noisy = pixels();
    addCanvasNoise(noisy, 'x');
    let changed = 0;
    for (let i = 0; i < base.length; i++) {
      if (base[i] !== noisy[i]) {
        changed++;
        expect(i % 4).not.toBe(3);
        expect(Math.abs(base[i]! - noisy[i]!)).toBe(1);
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
  it('leaves fully transparent pixels alone', () => {
    const blank = new Uint8ClampedArray(4 * 1000);
    addCanvasNoise(blank, 'x');
    expect(blank.every((v) => v === 0)).toBe(true);
  });
});

const setupSource = `
      class Navigator {
        get hardwareConcurrency() { return 2; }
        get deviceMemory() { return 1; }
        get platform() { return 'MacIntel'; }
      }
      class Screen {
        get width() { return 1000; } get height() { return 700; }
        get availWidth() { return 1000; } get availHeight() { return 680; }
      }
      class WebGLRenderingContext { getParameter(p) { return 'real-' + p; } }
      class CanvasRenderingContext2D {
        getImageData() { return { data: new Uint8ClampedArray(4 * 1000).fill(120) }; }
      }
      class HTMLCanvasElement { toDataURL() { return 'data:real'; } toBlob() {} }
      Object.assign(globalThis, { Navigator, Screen, WebGLRenderingContext, CanvasRenderingContext2D, HTMLCanvasElement });
      globalThis.navigator = new Navigator();
      globalThis.screen = new Screen();
      globalThis.outerWidth = 900; globalThis.outerHeight = 600;
      `;

describe('installFingerprint', () => {
  let ctx: ReturnType<typeof createContext>;
  let fp: ReturnType<typeof installFingerprint>;
  const run = <T = unknown>(code: string): T => runInContext(code, ctx) as T;
  const config = (over: Partial<FingerprintConfig>): FingerprintConfig => ({
    ...NO_FINGERPRINT,
    seed: 'profile-1',
    siteSeed: 'profile-1:site',
    ...over,
  });

  beforeEach(() => {
    ctx = createContext({});
    runInContext(setupSource, ctx);
    fp = installFingerprint(runInContext('globalThis', ctx));
  });

  it('does nothing until configured, and when everything is off', () => {
    expect(run('navigator.hardwareConcurrency')).toBe(2);
    fp.setConfig(config({}));
    expect(run('navigator.hardwareConcurrency')).toBe(2);
    expect(run('screen.width')).toBe(1000);
    expect(run('new WebGLRenderingContext().getParameter(0x9245)')).toBe('real-37445');
  });
  it('hardware toggles are independent', () => {
    fp.setConfig(config({ hardwareConcurrency: 12 }));
    expect(run('navigator.hardwareConcurrency')).toBe(12);
    expect(run('navigator.deviceMemory')).toBe(1);
    fp.setConfig(config({ deviceMemory: 8 }));
    expect(run('navigator.hardwareConcurrency')).toBe(2);
    expect(run('navigator.deviceMemory')).toBe(8);
  });
  it('spoofs the screen consistently and keeps taskbar space', () => {
    fp.setConfig(config({ screenSpoof: true }));
    const [w, h, aw, ah] = run<number[]>(
      '[screen.width, screen.height, screen.availWidth, screen.availHeight]',
    );
    expect(w).toBeGreaterThanOrEqual(900);
    expect(h).toBeGreaterThanOrEqual(600);
    expect(aw).toBe(w);
    expect(h! - ah!).toBe(20);
    expect(run('navigator.hardwareConcurrency')).toBe(2);
  });
  it('keeps the real GPU when no model fits the machine (2 cores, small screen)', () => {
    fp.setConfig(config({ webglSpoof: true }));
    expect(run('new WebGLRenderingContext().getParameter(0x9245)')).toBe('real-37445');
    expect(fp.currentGpu()).toBeNull();
  });
  it('spoofs only the unmasked WebGL strings, with a GPU that fits cores and screen', () => {
    const big = createContext({});
    runInContext(
      setupSource
        .replace('return 2;', 'return 8;')
        .replace(/return 1000;/g, 'return 1920;')
        .replace('return 700;', 'return 1080;')
        .replace('return 680;', 'return 1060;'),
      big,
    );
    const bigFp = installFingerprint(runInContext('globalThis', big));
    bigFp.setConfig(config({ webglSpoof: true, hardwareConcurrency: 8 }));
    const read = (code: string) => runInContext(code, big) as string;
    const vendor = read('new WebGLRenderingContext().getParameter(0x9245)');
    const renderer = read('new WebGLRenderingContext().getParameter(0x9246)');
    const gpu = bigFp.currentGpu()!;
    expect(gpu.os).toBe('mac');
    expect(gpu.cores).toContain(8);
    expect([vendor, renderer]).toEqual([gpu.vendor, gpu.renderer]);
    expect(read('new WebGLRenderingContext().getParameter(7936)')).toBe('real-7936'); // masked: untouched
    expect(read('new WebGLRenderingContext().getParameter(0x9245)')).toBe(vendor); // stable
  });
  it('uses the GPU it is given (workers get the page choice)', () => {
    const model = GPU_MODELS.find((m) => m.renderer.includes('RTX 3060'))!;
    const ctx2 = createContext({});
    runInContext(setupSource, ctx2);
    const given = installFingerprint(runInContext('globalThis', ctx2), { gpu: model });
    given.setConfig(config({ webglSpoof: true }));
    expect(runInContext('new WebGLRenderingContext().getParameter(0x9246)', ctx2)).toBe(
      model.renderer,
    );
    const none = createContext({});
    runInContext(setupSource, none);
    const keepReal = installFingerprint(runInContext('globalThis', none), { gpu: null });
    keepReal.setConfig(config({ webglSpoof: true }));
    expect(runInContext('new WebGLRenderingContext().getParameter(0x9246)', none)).toBe(
      'real-37446',
    );
  });
  it('adds canvas noise to getImageData only when enabled', () => {
    fp.setConfig(config({ canvasNoise: true }));
    const noisy = run<number>(
      `(() => { const d = new CanvasRenderingContext2D().getImageData().data; return d.filter((v) => v !== 120).length; })()`,
    );
    expect(noisy).toBeGreaterThan(0);
    fp.setConfig(null);
    expect(
      run<number>(
        `(() => { const d = new CanvasRenderingContext2D().getImageData().data; return d.filter((v) => v !== 120).length; })()`,
      ),
    ).toBe(0);
  });
  it('keeps patched functions native-looking', () => {
    expect(run('Function.prototype.toString.call(HTMLCanvasElement.prototype.toDataURL)')).toBe(
      'function toDataURL() { [native code] }',
    );
    expect(
      run(
        "Function.prototype.toString.call(Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency').get)",
      ),
    ).toBe('function get hardwareConcurrency() { [native code] }');
  });
  it('picks an OS from navigator.platform', () => {
    expect(osOf('MacIntel')).toBe('mac');
    expect(osOf('Win32')).toBe('win');
    expect(osOf('Linux x86_64')).toBe('linux');
  });
});
