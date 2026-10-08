import { existsSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { NO_FINGERPRINT } from '../src/shared/fingerprint';
import { GPU_MODELS } from '../src/shared/gpus';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import type { SpoofConfig } from '../src/shared/spoof-config';

const BUNDLE = 'dist/content/worker.js';

// Runs the real built prelude, exactly as the wrapper blob would, in a fake worker realm.
describe.skipIf(!existsSync(BUNDLE))('built worker prelude (dist/content/worker.js)', () => {
  const model = GPU_MODELS.find((m) => m.description === 'Apple M1')!;
  const config: SpoofConfig = {
    active: true,
    timezone: 'Asia/Tokyo',
    locale: 'en-US',
    acceptLanguage: 'en-US,en;q=0.9',
    languages: ['en-US', 'en'],
    whitelist: [],
    fingerprint: { ...NO_FINGERPRINT, seed: 's', siteSeed: 's:x', webglSpoof: true },
    shields: SHIELD_DEFAULTS,
    coordinates: null,
    stealth: false,
  };

  const boot = () => {
    const ctx = createContext({ URL });
    runInContext(
      `
      class WorkerLocation {}
      class WorkerGlobalScope { get location() { return 'real'; } importScripts() {} fetch() {} }
      class WorkerNavigator {
        get platform() { return 'MacIntel'; } get language() { return 'fa-IR'; }
        get languages() { return ['fa-IR']; } get hardwareConcurrency() { return 8; }
      }
      class WebGLRenderingContext { getParameter(p) { return 'real-' + p; } }
      Object.setPrototypeOf(globalThis, WorkerGlobalScope.prototype);
      Object.assign(globalThis, { WorkerLocation, WorkerGlobalScope, WorkerNavigator, WebGLRenderingContext });
      globalThis.navigator = new WorkerNavigator();
      `,
      ctx,
    );
    const init = { config, base: 'https://site.test/w.js', gpu: model };
    runInContext(`self = globalThis; self.__noleaker__ = ${JSON.stringify(init)};`, ctx);
    runInContext(readFileSync(BUNDLE, 'utf8'), ctx);
    return (code: string) => runInContext(code, ctx);
  };

  it('applies the shields and removes its init data', () => {
    const run = boot();
    expect(run('typeof globalThis.__noleaker__')).toBe('undefined');
    expect(run('new Date(Date.UTC(2020, 0, 15, 12)).getHours()')).toBe(21); // Tokyo is UTC+9
    expect(run('Intl.DateTimeFormat().resolvedOptions().timeZone')).toBe('Asia/Tokyo');
    expect(run('navigator.language')).toBe('en-US');
    expect(run('new WebGLRenderingContext().getParameter(0x9246)')).toBe(model.renderer);
    expect(run('location.href')).toBe('https://site.test/w.js');
  });
});
