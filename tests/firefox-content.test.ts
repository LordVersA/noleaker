/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createNative, scrubStack } from '../src/content/native';

// A realm whose Function.prototype.toString prints natives the way Firefox does.
function firefoxRealm(): any {
  const ctx = createContext({});
  runInContext(
    `const real = Function.prototype.toString;
     const fake = function toString() {
       if (this === fake) return 'function toString() {\\n    [native code]\\n}';
       return real.call(this).replace('{ [native code] }', '{\\n    [native code]\\n}');
     };
     Function.prototype.toString = fake;`,
    ctx,
  );
  return runInContext('globalThis', ctx);
}

describe('content scripts on Firefox', () => {
  it('scrubStack drops moz-extension frames (Firefox stack format)', () => {
    const e = new Error('boom');
    e.stack = [
      'inner@moz-extension://0f1e2d3c/content/main.js:10:5',
      'page@https://site.test/app.js:2:2',
    ].join('\n');
    scrubStack(e);
    expect(e.stack).toBe('page@https://site.test/app.js:2:2');
  });

  it("patched functions print in the engine's native format", () => {
    const g = firefoxRealm();
    const { patch, method, patchGetter } = createNative(g);
    patch(
      g.Date.prototype,
      'getHours',
      (orig) =>
        function (this: any) {
          return orig.call(this);
        },
    );
    const toStr = (f: unknown) => g.Function.prototype.toString.call(f);
    expect(toStr(g.Date.prototype.getHours)).toBe('function getHours() {\n    [native code]\n}');
    expect(toStr(method('probe', 0, () => 1))).toBe('function probe() {\n    [native code]\n}');
    expect(toStr(g.Function.prototype.toString)).toBe(
      'function toString() {\n    [native code]\n}',
    );
    // A getter keeps whatever name the engine gives the real one.
    patchGetter(g.ArrayBuffer.prototype, 'byteLength', (orig) => orig());
    const get = Object.getOwnPropertyDescriptor(g.ArrayBuffer.prototype, 'byteLength')!.get;
    expect(toStr(get)).toBe('function get byteLength() {\n    [native code]\n}');
  });
});
