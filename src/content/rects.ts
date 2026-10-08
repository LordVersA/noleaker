/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashString, type FingerprintConfig } from '../shared/fingerprint';
import { createNative } from './native';
import { unit } from './noise';

/** Largest nudge: 1/64 px, far below anything a user or a layout can see. */
const STEP = 1 / 64;
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const;
const METRIC_KEYS = [
  'width',
  'actualBoundingBoxLeft',
  'actualBoundingBoxRight',
  'actualBoundingBoxAscent',
  'actualBoundingBoxDescent',
  'fontBoundingBoxAscent',
  'fontBoundingBoxDescent',
  'emHeightAscent',
  'emHeightDescent',
  'hangingBaseline',
  'alphabeticBaseline',
  'ideographicBaseline',
] as const;

/**
 * Layout measurement noise: element and range rects, text metrics, SVG text lengths and boxes
 * move by at most 1/64 px. A value that is already a multiple of 1/4 px is left alone (pixel
 * snapped layout, integers, halves), and the nudge depends only on the site seed and the value,
 * so the same measurement always returns the same number.
 */
export function installRects(g: any): { setConfig(fp: FingerprintConfig | null): void } {
  const { patch, patchGetter } = createNative(g);
  let fp: FingerprintConfig | null = null;
  const on = (): boolean => !!fp?.rectNoise;

  function nudge(value: number, salt: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value % 0.25 === 0) return value;
    const j =
      (unit(hashString(`${fp!.siteSeed}:rect:${salt}`), hashString(String(value))) * 2 - 1) * STEP;
    return value + j;
  }

  /** Move a DOMRect's x/y/width/height in place; left/top/right/bottom follow natively. */
  function nudgeRect(rect: any): any {
    if (!on() || !rect) return rect;
    for (const key of RECT_KEYS) {
      try {
        const value = rect[key];
        const next = nudge(value, key);
        if (next !== value) rect[key] = next;
      } catch {
        // read-only rect: leave it
      }
    }
    return rect;
  }

  function nudgeList(list: any): any {
    if (on() && list) for (let i = 0; i < list.length; i++) nudgeRect(list[i]);
    return list;
  }

  for (const [proto, key, list] of [
    [g.Element?.prototype, 'getBoundingClientRect', false],
    [g.Element?.prototype, 'getClientRects', true],
    [g.Range?.prototype, 'getBoundingClientRect', false],
    [g.Range?.prototype, 'getClientRects', true],
    [g.SVGGraphicsElement?.prototype, 'getBBox', false],
  ] as const) {
    if (!proto?.[key]) continue;
    patch(
      proto,
      key,
      (orig) =>
        function (this: any, ...args: unknown[]) {
          const result = orig.apply(this, args);
          return list ? nudgeList(result) : nudgeRect(result);
        },
    );
  }

  const metrics: any = g.TextMetrics?.prototype;
  if (metrics) {
    for (const key of METRIC_KEYS) {
      patchGetter(metrics, key, (orig) => {
        const value = orig() as number;
        return on() ? nudge(value, `text:${key}`) : value;
      });
    }
  }

  const svgText: any = g.SVGTextContentElement?.prototype;
  for (const key of ['getComputedTextLength', 'getSubStringLength']) {
    if (!svgText?.[key]) continue;
    patch(
      svgText,
      key,
      (orig) =>
        function (this: any, ...args: unknown[]) {
          const value = orig.apply(this, args);
          return on() ? nudge(value, `svg:${key}`) : value;
        },
    );
  }

  return {
    setConfig(next) {
      fp = next;
    },
  };
}
