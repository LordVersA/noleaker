/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashString, pick, SCREEN_SIZES, type FingerprintConfig } from '../shared/fingerprint';
import { chooseGpu, type GpuModel, type Os } from '../shared/gpus';
import { createNative } from './native';

const UNMASKED_VENDOR = 0x9245;
const UNMASKED_RENDERER = 0x9246;
/** Skip canvases bigger than this (pixels) to keep exports fast. */
const MAX_NOISE_PIXELS = 16_000_000;

export function osOf(platform: string): Os {
  const p = platform.toLowerCase();
  return p.includes('mac') ? 'mac' : p.includes('win') ? 'win' : 'linux';
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flip the lowest bit of one colour channel on a deterministic ~6% of visible pixels. */
export function addCanvasNoise(data: Uint8ClampedArray, seed: string): void {
  const rand = mulberry32(hashString(seed));
  for (let i = 0; i < data.length; i += 4) {
    const r = rand();
    if (r < 0.06 && data[i + 3]! > 0) data[i + Math.floor((r / 0.06) * 3)]! ^= 1;
  }
}

export interface FingerprintOptions {
  /**
   * Use this GPU instead of choosing one. Workers get the page's choice this way, because they
   * cannot see the screen. `null` means "keep the real GPU".
   */
  gpu?: GpuModel | null;
}

/**
 * Optional fingerprint spoofing for one realm (a page or a worker). Each flag only touches its
 * own values, and each patch falls through to the native behaviour when its flag is off.
 */
export function installFingerprint(
  g: any,
  options: FingerprintOptions = {},
): { setConfig(fp: FingerprintConfig | null): void; currentGpu(): GpuModel | null } {
  const { patch, patchGetter } = createNative(g);
  let fp: FingerprintConfig | null = null;
  let screenSize: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
  } | null = null;

  const os = osOf(g.navigator?.platform ?? '');

  // ---- hardware ----------------------------------------------------------------------
  const nav: any = g.Navigator?.prototype ?? g.WorkerNavigator?.prototype;
  const realCoresGetter = nav
    ? Object.getOwnPropertyDescriptor(nav, 'hardwareConcurrency')?.get
    : undefined;
  if (nav) {
    patchGetter(nav, 'hardwareConcurrency', (orig) => fp?.hardwareConcurrency ?? orig());
    patchGetter(nav, 'deviceMemory', (orig) => fp?.deviceMemory ?? orig());
  }

  // ---- screen ------------------------------------------------------------------------
  const screenProto: any = g.Screen?.prototype;
  const real = (key: string): number => {
    const desc = screenProto ? Object.getOwnPropertyDescriptor(screenProto, key) : undefined;
    return desc?.get ? desc.get.call(g.screen) : 0;
  };
  if (screenProto) {
    for (const key of ['width', 'height', 'availWidth', 'availHeight'] as const) {
      patchGetter(screenProto, key, (orig) => (screenSize ? screenSize[key] : orig()));
    }
  }
  function chooseScreen(seed: string): typeof screenSize {
    const width = real('width');
    const height = real('height');
    if (!width || !height) return null;
    const outerW = g.outerWidth || 0;
    const outerH = g.outerHeight || 0;
    // The screen must be able to hold the current window, or the page would notice.
    const fits = SCREEN_SIZES.filter(([w, h]) => w >= outerW && h >= outerH);
    if (fits.length === 0) return null;
    const [w, h] = pick(fits, seed, 'screen');
    return {
      width: w,
      height: h,
      availWidth: w - (width - real('availWidth')),
      availHeight: h - (height - real('availHeight')),
    };
  }

  // ---- GPU: WebGL and WebGPU ----------------------------------------------------------
  /** The GPU to claim: one that fits the cores and screen the page sees, or null (real GPU). */
  function currentGpu(): GpuModel | null {
    if (options.gpu !== undefined) return options.gpu;
    if (!fp) return null;
    const cores =
      fp.hardwareConcurrency ?? (realCoresGetter ? realCoresGetter.call(g.navigator) : 0);
    const screen =
      screenSize ?? (real('width') ? { width: real('width'), height: real('height') } : null);
    return chooseGpu(os, fp.seed, cores, screen);
  }

  for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const proto: any = g[name]?.prototype;
    if (!proto?.getParameter) continue;
    patch(
      proto,
      'getParameter',
      (orig) =>
        function (this: any, parameter: number) {
          if (
            fp?.webglSpoof &&
            (parameter === UNMASKED_VENDOR || parameter === UNMASKED_RENDERER)
          ) {
            const gpu = currentGpu();
            if (gpu) return parameter === UNMASKED_VENDOR ? gpu.vendor : gpu.renderer;
          }
          return orig.call(this, parameter);
        },
    );
  }

  const adapterInfo: any = g.GPUAdapterInfo?.prototype;
  if (adapterInfo) {
    for (const key of ['device', 'description'] as const) {
      patchGetter(adapterInfo, key, (orig) => {
        const gpu = fp?.webglSpoof ? currentGpu() : null;
        return gpu ? gpu[key] : orig();
      });
    }
  }

  // ---- canvas and OffscreenCanvas -----------------------------------------------------
  const canvasProto: any = g.HTMLCanvasElement?.prototype;
  const ctx2dProto: any = g.CanvasRenderingContext2D?.prototype;
  const offscreenProto: any = g.OffscreenCanvas?.prototype;
  const offscreenCtxProto: any = g.OffscreenCanvasRenderingContext2D?.prototype;
  const nativeGetImageData = ctx2dProto?.getImageData;
  const nativeOffscreenGetImageData = offscreenCtxProto?.getImageData;

  /** A noisy copy of the canvas; the page's own canvas is never modified. */
  function noisyCopy(canvas: any): any | null {
    const { width, height } = canvas;
    if (!fp?.canvasNoise || !width || !height || width * height > MAX_NOISE_PIXELS) return null;
    try {
      const offscreen = !g.document || canvas instanceof g.OffscreenCanvas;
      let copy: any;
      if (offscreen) copy = new g.OffscreenCanvas(width, height);
      else {
        copy = g.document.createElement('canvas');
        copy.width = width;
        copy.height = height;
      }
      const ctx = copy.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const read = offscreen ? nativeOffscreenGetImageData : nativeGetImageData;
      const image = read.call(ctx, 0, 0, width, height);
      addCanvasNoise(image.data, fp.siteSeed);
      ctx.putImageData(image, 0, 0);
      return copy;
    } catch {
      return null; // tainted or unreadable canvas: leave it alone
    }
  }

  const exporting = (proto: any, key: string) => {
    if (!proto?.[key]) return;
    const nativeFn = proto[key];
    patch(
      proto,
      key,
      () =>
        function (this: any, ...args: any[]) {
          const copy = noisyCopy(this);
          return nativeFn.apply(copy ?? this, args);
        },
    );
  };
  exporting(canvasProto, 'toDataURL');
  exporting(canvasProto, 'toBlob');
  exporting(offscreenProto, 'convertToBlob');

  for (const proto of [ctx2dProto, offscreenCtxProto]) {
    if (!proto?.getImageData) continue;
    patch(
      proto,
      'getImageData',
      (orig) =>
        function (this: any, ...args: any[]) {
          const image = orig.apply(this, args);
          if (fp?.canvasNoise && image.data.length <= MAX_NOISE_PIXELS * 4) {
            addCanvasNoise(image.data, fp.siteSeed);
          }
          return image;
        },
    );
  }

  return {
    setConfig(next) {
      fp = next;
      screenSize = next?.screenSpoof ? chooseScreen(next.seed) : null;
    },
    currentGpu,
  };
}
