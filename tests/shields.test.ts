import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { protectionPlan } from '../src/background/protection';
import { createNative } from '../src/content/native';
import { acceptLanguageFor, COUNTRY_PROFILES } from '../src/shared/country-profiles';
import { COUNTRIES, defaultTimezone } from '../src/shared/countries';
import { normalizeShields, SHIELD_DEFAULTS, SHIELDS } from '../src/shared/shields';
import { buildSpoofConfig } from '../src/shared/spoof-config';
import { DEFAULT_STATE } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const profile = { id: 'a', name: 'a', host: 'h.com', port: 1 };
const exit = { ip: '1.1.1.1', countryCode: 'DE', timezone: 'Europe/Berlin', detectedAt: 0 };
const live: State = {
  ...DEFAULT_STATE,
  routingMode: 'compatibility',
  enabled: true,
  profiles: [profile],
  activeProfileId: 'a',
  detectedExit: exit,
};

describe('shield defaults', () => {
  it('country-linked shields are on, fingerprint-noise shields are off', () => {
    for (const s of SHIELDS.filter((x) => x.group === 'country')) {
      expect(SHIELD_DEFAULTS[s.key], s.key).toBe(true);
    }
    for (const s of SHIELDS.filter((x) => x.group === 'fingerprint')) {
      expect(SHIELD_DEFAULTS[s.key], s.key).toBe(false);
    }
  });
  it('every toggle has exactly one entry in the options list', () => {
    expect(SHIELDS.map((s) => s.key).sort()).toEqual(Object.keys(SHIELD_DEFAULTS).sort());
  });
  it('normalizeShields keeps booleans only', () => {
    expect(normalizeShields({ timezone: false, canvas: 1, nope: true })).toEqual({
      ...SHIELD_DEFAULTS,
      timezone: false,
    });
    expect(normalizeShields(null)).toEqual(SHIELD_DEFAULTS);
  });
});

describe('buildSpoofConfig passes shields', () => {
  it('carries the switches', () => {
    const shields = { ...SHIELD_DEFAULTS, locale: false };
    expect(buildSpoofConfig({ ...live, shields }).shields).toEqual(shields);
  });
  it('is the inactive config when paused', () => {
    expect(buildSpoofConfig({ ...live, killSwitchActive: true })).toMatchObject({ active: false });
  });
});

describe('protectionPlan follows each shield', () => {
  it('defaults: WebRTC policy, Alt-Svc strip and Accept-Language are all planned', () => {
    expect(protectionPlan(live)).toMatchObject({
      webrtc: true,
      altSvc: true,
      acceptLanguage: true,
    });
  });
  it('webrtc off removes only the WebRTC policy', () => {
    const p = protectionPlan({ ...live, shields: { ...SHIELD_DEFAULTS, webrtc: false } });
    expect(p).toMatchObject({ webrtc: false, altSvc: true, acceptLanguage: true });
  });
  it('locale off removes only the Accept-Language rule', () => {
    const p = protectionPlan({ ...live, shields: { ...SHIELD_DEFAULTS, locale: false } });
    expect(p).toMatchObject({ webrtc: true, altSvc: true, acceptLanguage: false });
  });
  it('proxy off plans nothing', () => {
    expect(protectionPlan({ ...live, enabled: false })).toMatchObject({
      webrtc: false,
      altSvc: false,
      acceptLanguage: false,
    });
  });
});

describe('country profiles', () => {
  it('one table: COUNTRIES is a view of it', () => {
    expect(Object.keys(COUNTRIES)).toEqual(Object.keys(COUNTRY_PROFILES));
    expect(defaultTimezone('DE')).toBe('Europe/Berlin');
    expect(defaultTimezone('ZZ')).toBeNull();
  });
  it('every country has valid coordinates, timezone and locale', () => {
    for (const [code, p] of Object.entries(COUNTRY_PROFILES)) {
      expect(Math.abs(p.latitude), code).toBeLessThanOrEqual(90);
      expect(Math.abs(p.longitude), code).toBeLessThanOrEqual(180);
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: p.timezone }), code).not.toThrow();
      expect(Intl.getCanonicalLocales(p.locale), code).toHaveLength(1);
      expect(p.acceptLanguage.startsWith(p.locale), code).toBe(true);
    }
  });
  it('builds Accept-Language like Chrome', () => {
    expect(acceptLanguageFor('en-US')).toBe('en-US,en;q=0.9');
    expect(acceptLanguageFor('de-DE')).toBe('de-DE,de;q=0.9,en;q=0.8');
  });
});

describe('createNative strict mode', () => {
  const source = `
    class Box {
      get size() { return 1; }
      measure(a, b) { return a + b; }
    }
    globalThis.Box = Box;
  `;
  const shape = (ctx: ReturnType<typeof createContext>, expr: string) =>
    runInContext(
      `(() => { const f = ${expr}; return JSON.stringify([Reflect.ownKeys(f), Object.getOwnPropertyDescriptor(f, 'name'), Object.getOwnPropertyDescriptor(f, 'length')]); })()`,
      ctx,
    );

  it('is off by default and can be switched on', () => {
    const ctx = createContext({});
    runInContext(source, ctx);
    const native = createNative(runInContext('globalThis', ctx));
    expect(native.strict).toBe(false);
    expect(createNative(runInContext('globalThis', ctx), { strict: true }).strict).toBe(true);
  });

  it('patched functions have the same own-property shape as the pristine ones', () => {
    const pristine = createContext({});
    runInContext(source, pristine);
    const patched = createContext({});
    runInContext(source, patched);
    const g = runInContext('globalThis', patched);
    const native = createNative(g, { strict: true });
    native.patch(
      g.Box.prototype,
      'measure',
      (orig) =>
        function (this: unknown, ...args: unknown[]) {
          return orig.apply(this, args);
        },
    );
    native.patchGetter(g.Box.prototype, 'size', (orig) => orig());

    expect(shape(patched, 'Box.prototype.measure')).toBe(shape(pristine, 'Box.prototype.measure'));
    expect(shape(patched, "Object.getOwnPropertyDescriptor(Box.prototype, 'size').get")).toBe(
      shape(pristine, "Object.getOwnPropertyDescriptor(Box.prototype, 'size').get"),
    );
    expect(runInContext('new Box().measure(2, 3)', patched)).toBe(5);
    expect(runInContext("Box.prototype.measure.hasOwnProperty('prototype')", patched)).toBe(false);
  });
});
