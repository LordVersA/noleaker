/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPersianFont, normalizeFamily } from '../shared/persian-fonts';
import type { SpoofConfig } from '../shared/spoof-config';
import { createNative } from './native';

const SIZE =
  /(^|\s)(\d*\.?\d+(?:px|pt|pc|em|rem|ex|ch|vw|vh|vmin|vmax|%|cm|mm|in|q)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)(\/\S+)?\s+/i;

/** What a page sees when none of its families exist: the browser's default font. */
const ABSENT = 'serif';

/**
 * Hides Persian font families by removing them from font stacks, so a page measuring text
 * sees the same widths as on a machine without them. A family the page loaded itself with
 * `@font-face` (listed in `document.fonts`) is never touched.
 */
export function installFonts(g: any): { setConfig(config: SpoofConfig | null): void } {
  const { patch, patchSetter, define } = createNative(g);
  let on = false;

  const loadedByPage = (): Set<string> => {
    const set = new Set<string>();
    try {
      g.document.fonts.forEach((face: any) => set.add(normalizeFamily(face.family)));
    } catch {
      // no document.fonts: nothing was loaded by the page
    }
    return set;
  };

  /** Drop Persian families from a comma-separated family list. `text` is unchanged if none. */
  function filterFamilies(list: string): { text: string; changed: boolean } {
    const mine = loadedByPage();
    const kept = list
      .split(',')
      .map((f) => f.trim())
      .filter((f) => f === '' || !isPersianFont(f) || mine.has(normalizeFamily(f)));
    const changed = kept.length !== list.split(',').length;
    return { text: changed ? kept.join(', ') : list, changed };
  }

  /** `font-family` value. */
  const family = (value: string): string => {
    if (!on) return value;
    const r = filterFamilies(value);
    return r.changed ? r.text || ABSENT : value;
  };

  /** `font` shorthand: "italic 12px/1.5 IRANSans, Arial". */
  const shorthand = (value: string): string => {
    if (!on) return value;
    const m = SIZE.exec(value);
    if (!m) return value;
    const cut = m.index + m[0].length;
    const r = filterFamilies(value.slice(cut));
    return r.changed ? value.slice(0, cut) + (r.text || ABSENT) : value;
  };

  /** Inline style text: rewrite every font-family and font declaration. */
  const styleText = (value: string): string => {
    if (!on) return value;
    return value
      .replace(/(font-family\s*:\s*)([^;]+)/gi, (_m, head, list) => head + family(list))
      .replace(/((?<![-\w])font\s*:\s*)([^;]+)/gi, (_m, head, list) => head + shorthand(list));
  };

  const styleProto: any = g.CSSStyleDeclaration?.prototype;
  if (styleProto) {
    patchSetter(
      styleProto,
      'fontFamily',
      (orig) =>
        function (this: any, v: unknown) {
          orig.call(this, family(String(v)));
        },
    );
    patchSetter(
      styleProto,
      'font',
      (orig) =>
        function (this: any, v: unknown) {
          orig.call(this, shorthand(String(v)));
        },
    );
    patchSetter(
      styleProto,
      'cssText',
      (orig) =>
        function (this: any, v: unknown) {
          orig.call(this, styleText(String(v)));
        },
    );
    patch(
      styleProto,
      'setProperty',
      (orig) =>
        function (this: any, name: unknown, value: unknown, ...rest: unknown[]) {
          const prop = String(name).toLowerCase();
          const v =
            prop === 'font-family'
              ? family(String(value))
              : prop === 'font'
                ? shorthand(String(value))
                : value;
          return orig.call(this, name, v, ...rest);
        },
    );
  }

  const elementProto: any = g.Element?.prototype;
  if (elementProto) {
    patch(
      elementProto,
      'setAttribute',
      (orig) =>
        function (this: any, name: unknown, value: unknown) {
          return orig.call(
            this,
            name,
            String(name).toLowerCase() === 'style' ? styleText(String(value)) : value,
          );
        },
    );
  }

  for (const name of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D']) {
    const proto: any = g[name]?.prototype;
    if (proto) {
      patchSetter(
        proto,
        'font',
        (orig) =>
          function (this: any, v: unknown) {
            orig.call(this, shorthand(String(v)));
          },
      );
    }
  }

  const faceSetProto: any = g.FontFaceSet?.prototype;
  if (faceSetProto?.check) {
    patch(
      faceSetProto,
      'check',
      (orig) =>
        function (this: any, font: unknown, ...rest: unknown[]) {
          return orig.call(this, shorthand(String(font)), ...rest);
        },
    );
  }

  // Local Font Access API: installed fonts, minus the Persian ones.
  if (typeof g.queryLocalFonts === 'function') {
    patch(
      g,
      'queryLocalFonts',
      (orig) =>
        async function (this: any, ...args: unknown[]) {
          const fonts: any[] = await orig.apply(this, args);
          return on
            ? fonts.filter((f) => !isPersianFont(f.family) && !isPersianFont(f.fullName))
            : fonts;
        },
    );
  }

  void define;
  return {
    setConfig(config) {
      on = !!config?.active && config.shields.fonts;
    },
  };
}
