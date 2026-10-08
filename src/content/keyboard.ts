/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SpoofConfig } from '../shared/spoof-config';
import { createNative } from './native';

/** What `navigator.keyboard.getLayoutMap()` returns on a US QWERTY keyboard. */
export const US_LAYOUT: [string, string][] = [
  ['Backquote', '`'],
  ['Backslash', '\\'],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Comma', ','],
  ['Equal', '='],
  ['Minus', '-'],
  ['Period', '.'],
  ['Quote', "'"],
  ['Semicolon', ';'],
  ['Slash', '/'],
  ...Array.from({ length: 10 }, (_, i): [string, string] => [`Digit${i}`, String(i)]),
  ...Array.from({ length: 26 }, (_, i): [string, string] => [
    `Key${String.fromCharCode(65 + i)}`,
    String.fromCharCode(97 + i),
  ]),
];

/** `getLayoutMap()` resolves to a US QWERTY map, so a Persian layout is not exposed. */
export function installKeyboard(g: any): { setConfig(config: SpoofConfig | null): void } {
  const { patch } = createNative(g);
  let on = false;

  const proto: any = g.Keyboard?.prototype;
  if (proto?.getLayoutMap) {
    patch(
      proto,
      'getLayoutMap',
      (orig) =>
        function (this: any) {
          if (!on) return orig.call(this);
          const map = new g.Map(US_LAYOUT);
          Object.defineProperty(map, Symbol.toStringTag, { value: 'KeyboardLayoutMap' });
          return g.Promise.resolve(map);
        },
    );
  }

  return {
    setConfig(config) {
      on = !!config?.active && config.shields.keyboard;
    },
  };
}
