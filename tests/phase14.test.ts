import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { analyzeAudit } from '../src/audit/analyze';
import type { AuditObservation } from '../src/audit/collect';
import { installSpoof } from '../src/content/spoof';
import { analyzePageSample, type PageSample } from '../src/leaktest/analyze';
import { autoIdentity, resolveIdentity } from '../src/shared/identity';
import {
  angularDistance,
  checkOverrides,
  MAX_COORDINATE_DISTANCE,
} from '../src/shared/override-check';
import {
  NO_OVERRIDES,
  normalizeAcceptLanguage,
  normalizeLocale,
  normalizeTimezone,
  parseAcceptLanguage,
  sanitizeOverrides,
  validateOverrideInput,
  type OverrideInput,
} from '../src/shared/overrides';
import { exportSettings, parseSettings } from '../src/shared/settings';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import { ACCEPT_LANGUAGE, buildSpoofConfig, LANGUAGES, LOCALE } from '../src/shared/spoof-config';
import { summarize } from '../src/shared/status';
import { DEFAULT_STATE, migrateState, SCHEMA_VERSION } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const profile = { id: 'a', name: 'a', host: 'h.com', port: 1 };
const exit = (countryCode: string, timezone: string) => ({
  ip: '1.1.1.1',
  countryCode,
  timezone,
  detectedAt: 0,
});
const live = (
  over: Partial<State> = {},
  country: [string, string] = ['DE', 'Europe/Berlin'],
): State => ({
  ...DEFAULT_STATE,
  controlsVerifiedAt: Date.now(),
  enabled: true,
  profiles: [profile],
  activeProfileId: 'a',
  detectedExit: exit(...country),
  ...over,
});
const withOverrides = (
  o: Partial<State['overrides']>,
  over: Partial<State> = {},
  country?: [string, string],
) => live({ overrides: { ...NO_OVERRIDES, ...o }, ...over }, country);

describe('normalising and validating overrides', () => {
  it('canonicalises timezone, locale and Accept-Language', () => {
    expect(normalizeTimezone(' europe/berlin ')).toBe('Europe/Berlin');
    expect(normalizeLocale('de-de')).toBe('de-DE');
    expect(normalizeAcceptLanguage('de-de , de;q=0.9,en;q=0.8')).toBe('de-DE,de;q=0.9,en;q=0.8');
    expect(parseAcceptLanguage('de-DE,de;q=0.9,*;q=0.1,en;q=0.8')).toEqual(['de-DE', 'de', 'en']);
  });
  it('rejects nonsense', () => {
    expect(normalizeTimezone('Mars/Olympus')).toBeNull();
    expect(normalizeTimezone('')).toBeNull();
    expect(normalizeLocale('not a locale')).toBeNull();
    expect(normalizeLocale('*')).toBeNull();
    expect(normalizeAcceptLanguage('de-DE;q=2')).toBeNull();
    expect(normalizeAcceptLanguage('de-DE;x=1')).toBeNull();
    expect(normalizeAcceptLanguage(',,')).toBeNull();
    expect(normalizeAcceptLanguage('a'.repeat(300))).toBeNull();
  });

  const input = (over: Partial<OverrideInput> = {}): OverrideInput => ({
    timezone: '',
    locale: '',
    acceptLanguage: '',
    latitude: '',
    longitude: '',
    ...over,
  });
  it('empty means automatic', () => {
    expect(validateOverrideInput(input())).toEqual({ overrides: NO_OVERRIDES, errors: {} });
  });
  it('accepts valid values', () => {
    const r = validateOverrideInput(
      input({
        timezone: 'asia/tokyo',
        locale: 'ja-jp',
        acceptLanguage: 'ja-JP,ja;q=0.9',
        latitude: '35.6',
        longitude: '139.7',
      }),
    );
    expect(r.errors).toEqual({});
    expect(r.overrides).toEqual({
      timezone: 'Asia/Tokyo',
      locale: 'ja-JP',
      acceptLanguage: 'ja-JP,ja;q=0.9',
      coordinates: { latitude: 35.6, longitude: 139.7 },
    });
  });
  it('reports each field separately', () => {
    const r = validateOverrideInput(
      input({
        timezone: 'nope',
        locale: '!!',
        acceptLanguage: 'x;q=9',
        latitude: '95',
        longitude: '10',
      }),
    );
    expect(Object.keys(r.errors).sort()).toEqual([
      'acceptLanguage',
      'coordinates',
      'locale',
      'timezone',
    ]);
  });
  it('validates coordinate ranges and pairs', () => {
    expect(validateOverrideInput(input({ latitude: '10' })).errors.coordinates).toMatch(/both/);
    expect(validateOverrideInput(input({ latitude: '90', longitude: '180' })).errors).toEqual({});
    expect(
      validateOverrideInput(input({ latitude: '-90.1', longitude: '0' })).errors.coordinates,
    ).toMatch(/Latitude/);
    expect(
      validateOverrideInput(input({ latitude: '0', longitude: '181' })).errors.coordinates,
    ).toMatch(/Longitude/);
    expect(
      validateOverrideInput(input({ latitude: 'abc', longitude: '0' })).errors.coordinates,
    ).toMatch(/Latitude/);
  });
  it('sanitizeOverrides turns anything invalid into automatic', () => {
    expect(sanitizeOverrides(undefined)).toEqual(NO_OVERRIDES);
    expect(
      sanitizeOverrides({
        timezone: 'Mars/X',
        locale: 5,
        coordinates: { latitude: 200, longitude: 0 },
      }),
    ).toEqual(NO_OVERRIDES);
    expect(
      sanitizeOverrides({ timezone: 'europe/paris', coordinates: { latitude: 1, longitude: 2 } }),
    ).toMatchObject({
      timezone: 'Europe/Paris',
      coordinates: { latitude: 1, longitude: 2 },
    });
  });
});

describe('identity', () => {
  it('with no overrides it is exactly what phase 13 did', () => {
    const id = resolveIdentity(live());
    expect(id).toMatchObject({
      timezone: 'Europe/Berlin',
      locale: LOCALE,
      acceptLanguage: ACCEPT_LANGUAGE,
      languages: LANGUAGES,
    });
    expect(id.coordinates).toEqual({ latitude: 52.52, longitude: 13.4 });
    expect(resolveIdentity(live())).toEqual(autoIdentity(live()));
    const config = buildSpoofConfig(live());
    expect(config).toMatchObject({
      locale: LOCALE,
      languages: LANGUAGES,
      acceptLanguage: ACCEPT_LANGUAGE,
    });
  });
  it('manual values win, field by field', () => {
    const s = withOverrides({ timezone: 'Asia/Tokyo', coordinates: { latitude: 1, longitude: 2 } });
    expect(resolveIdentity(s)).toMatchObject({
      timezone: 'Asia/Tokyo',
      locale: LOCALE,
      acceptLanguage: ACCEPT_LANGUAGE,
      coordinates: { latitude: 1, longitude: 2 },
    });
    expect(autoIdentity(s).timezone).toBe('Europe/Berlin'); // the baseline ignores overrides
  });
  it('a manual locale gets a matching Accept-Language; a manual header sets navigator.languages', () => {
    const localeOnly = resolveIdentity(withOverrides({ locale: 'de-DE' }));
    expect(localeOnly).toMatchObject({
      locale: 'de-DE',
      acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
      languages: ['de-DE', 'de', 'en'],
    });
    const header = resolveIdentity(
      withOverrides({ locale: 'de-DE', acceptLanguage: 'fr-FR,fr;q=0.8' }),
    );
    expect(header).toMatchObject({
      locale: 'de-DE',
      acceptLanguage: 'fr-FR,fr;q=0.8',
      languages: ['fr-FR', 'fr'],
    });
  });
  it('"match exit country" uses the country profile; manual values still win', () => {
    expect(resolveIdentity(live({ localeMode: 'country' }))).toMatchObject({
      locale: 'de-DE',
      acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
      languages: ['de-DE', 'de', 'en'],
    });
    expect(
      resolveIdentity(withOverrides({ locale: 'fr-FR' }, { localeMode: 'country' })).locale,
    ).toBe('fr-FR');
    expect(resolveIdentity(live({ localeMode: 'country' }, ['ZZ', 'Europe/Berlin'])).locale).toBe(
      LOCALE,
    ); // unknown country
  });
  it('follows the country override', () => {
    const s = live({ countryOverride: 'JP', localeMode: 'country' });
    expect(resolveIdentity(s)).toMatchObject({ timezone: 'Asia/Tokyo', locale: 'ja-JP' });
  });
  it('the spoof config carries the merged values and keeps the key rule', () => {
    const s = withOverrides({
      timezone: 'Asia/Tokyo',
      locale: 'ja-JP',
      coordinates: { latitude: 35, longitude: 139 },
    });
    expect(buildSpoofConfig(s)).toMatchObject({
      active: true,
      timezone: 'Asia/Tokyo',
      locale: 'ja-JP',
      acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.8',
      languages: ['ja-JP', 'ja', 'en'],
      coordinates: { latitude: 35, longitude: 139 },
    });
    expect(buildSpoofConfig({ ...s, killSwitchActive: true }).active).toBe(false);
    expect(buildSpoofConfig({ ...s, detectedExit: null }).active).toBe(false); // an override does not replace detection
    expect(buildSpoofConfig({ ...s, enabled: false }).active).toBe(false);
  });
});

describe('override warnings', () => {
  const ids = (s: State) => checkOverrides(s).map((w) => w.id);

  it('no warnings without overrides, or with consistent ones', () => {
    expect(ids(live())).toEqual([]);
    expect(
      ids(
        withOverrides({
          timezone: 'Europe/Berlin',
          locale: 'de-DE',
          coordinates: { latitude: 48.1, longitude: 11.6 },
        }),
      ),
    ).toEqual([]);
    expect(ids(live({ localeMode: 'country' }))).toEqual([]);
  });
  it('timezone that differs from the exit country', () => {
    const w = checkOverrides(withOverrides({ timezone: 'Asia/Tokyo' }));
    expect(w.map((x) => x.id)).toEqual(['timezone']);
    expect(w[0]!.message).toContain('Europe/Berlin');
  });
  it('Persian locale or Accept-Language, manual or from "match exit country"', () => {
    expect(ids(withOverrides({ locale: 'fa-IR' }, {}, ['IR', 'Asia/Tehran']))).toContain('persian');
    expect(ids(withOverrides({ acceptLanguage: 'fa,en;q=0.5' }))).toContain('persian');
    expect(ids(withOverrides({ acceptLanguage: 'en-US,fa;q=0.4' }))).toContain('persian');
    expect(ids(live({ localeMode: 'country' }, ['IR', 'Asia/Tehran']))).toContain('persian');
    expect(ids(withOverrides({ locale: 'fax' }))).not.toContain('persian'); // not fa-*
  });
  it('locale whose region differs from the exit country', () => {
    expect(ids(withOverrides({ locale: 'fr-FR' }))).toContain('region');
    expect(ids(withOverrides({ locale: 'de-DE' }))).not.toContain('region');
    expect(ids(withOverrides({ locale: 'de' }))).not.toContain('region'); // no region given
  });
  it('coordinates more than 12 degrees from the country', () => {
    const near = { latitude: 48.14, longitude: 11.58 }; // Munich, ~4.7 degrees from Berlin
    const far = { latitude: 40.42, longitude: -3.7 }; // Madrid, ~17 degrees
    expect(ids(withOverrides({ coordinates: near }))).not.toContain('coordinates');
    expect(ids(withOverrides({ coordinates: far }))).toContain('coordinates');
  });
  it('angularDistance is a real great-circle angle', () => {
    const a = { latitude: 0, longitude: 0 };
    expect(angularDistance(a, a)).toBe(0);
    expect(angularDistance(a, { latitude: 0, longitude: 90 })).toBeCloseTo(90, 5);
    expect(
      angularDistance({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 }),
    ).toBeCloseTo(180, 5);
    expect(
      angularDistance({ latitude: 52.52, longitude: 13.4 }, { latitude: 48.86, longitude: 2.35 }),
    ).toBeLessThan(MAX_COORDINATE_DISTANCE);
  });
  it('several warnings at once, and no warnings while the exit is unknown', () => {
    const s = withOverrides({
      timezone: 'Asia/Tehran',
      locale: 'fa-IR',
      coordinates: { latitude: 35, longitude: 51 },
    });
    expect(ids(s).sort()).toEqual(['coordinates', 'persian', 'region', 'timezone']);
    expect(ids({ ...s, detectedExit: null })).toEqual(['persian']);
  });
  it('shows up in the popup summary', () => {
    const s = withOverrides({ timezone: 'Asia/Tokyo', locale: 'fa-IR' });
    const summary = summarize(s);
    expect(summary).toMatchObject({ level: 'warn', label: 'Override' });
    expect(summary.reason).toContain('(+');
    expect(summarize(live()).level).toBe('ok');
  });
});

describe('storage, migration and export', () => {
  it('old state (schema 3) gets automatic overrides and English mode', () => {
    const s = migrateState({ schemaVersion: 3 });
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.overrides).toEqual(NO_OVERRIDES);
    expect(s.localeMode).toBe('english');
  });
  it('keeps valid overrides and drops invalid ones', () => {
    const s = migrateState({
      schemaVersion: 4,
      overrides: {
        timezone: 'europe/berlin',
        locale: '???',
        acceptLanguage: 'de-DE',
        coordinates: { latitude: 10, longitude: 20 },
      },
      localeMode: 'country',
    });
    expect(s.overrides).toEqual({
      timezone: 'Europe/Berlin',
      locale: null,
      acceptLanguage: 'de-DE',
      coordinates: { latitude: 10, longitude: 20 },
    });
    expect(s.localeMode).toBe('country');
    expect(migrateState({ schemaVersion: 4, localeMode: 'weird' }).localeMode).toBe('english');
  });
  it('overrides and the locale mode survive export and import', () => {
    const state = withOverrides(
      {
        timezone: 'Asia/Tokyo',
        locale: 'ja-JP',
        acceptLanguage: 'ja-JP,ja;q=0.9',
        coordinates: { latitude: 35, longitude: 139 },
      },
      { localeMode: 'country' },
    );
    expect(JSON.parse(exportSettings(state)).version).toBe(7);
    const r = parseSettings(exportSettings(state));
    expect(r.ok && r.patch.overrides).toEqual(state.overrides);
    expect(r.ok && r.patch.localeMode).toBe('country');
  });
  it('older files import with automatic overrides; bad values in a new file are dropped', () => {
    const v2 = JSON.stringify({ format: 'noleaker-settings', version: 2, profiles: [] });
    const r2 = parseSettings(v2);
    expect(r2.ok && r2.patch.overrides).toEqual(NO_OVERRIDES);
    expect(r2.ok && r2.patch.localeMode).toBe('english');
    const bad = JSON.stringify({
      format: 'noleaker-settings',
      version: 3,
      profiles: [],
      overrides: { timezone: 'Mars/X', locale: 'de-DE' },
      localeMode: 'x',
    });
    const r3 = parseSettings(bad);
    expect(r3.ok && r3.patch.overrides).toEqual({ ...NO_OVERRIDES, locale: 'de-DE' });
    expect(r3.ok && r3.patch.localeMode).toBe('english');
  });
});

describe('overrides reach the page', () => {
  it('navigator.language(s) and the default Intl locale follow the Accept-Language and locale', () => {
    const ctx = createContext({});
    runInContext(
      "globalThis.Navigator = class Navigator { get language() { return 'fa-IR'; } get languages() { return ['fa-IR']; } }; globalThis.navigator = new Navigator();",
      ctx,
    );
    const spoof = installSpoof(runInContext('globalThis', ctx));
    spoof.setConfig(buildSpoofConfig(withOverrides({ locale: 'de-DE', timezone: 'Asia/Tokyo' })));
    const run = <T = unknown>(c: string) => runInContext(c, ctx) as T;
    expect(run('navigator.language')).toBe('de-DE');
    expect(run('navigator.languages.join()')).toBe('de-DE,de,en');
    expect(run('Intl.DateTimeFormat().resolvedOptions().locale')).toBe('de-DE');
    expect(run('Intl.DateTimeFormat().resolvedOptions().timeZone')).toBe('Asia/Tokyo');
  });
});

describe('leak test and audit expect the configured language', () => {
  const sample: PageSample = {
    now: Date.UTC(2020, 0, 15, 12),
    tz: 'Europe/Berlin',
    locale: 'de-DE',
    offset: -60,
    dateString: 'Wed Jan 15 2020 13:00:00 GMT+0100',
    language: 'de-DE',
    languages: ['de-DE', 'de', 'en'],
    workerTz: 'Europe/Berlin',
  };
  const expected = { locale: 'de-DE', languages: ['de-DE', 'de', 'en'] };
  it('leak test: passes the configured language and fails English when German is configured', () => {
    expect(
      analyzePageSample(sample, 'Europe/Berlin', expected).find((r) => r.id === 'language')?.status,
    ).toBe('pass');
    const english = { ...sample, language: 'en-US', languages: ['en-US', 'en'], locale: 'en-US' };
    expect(
      analyzePageSample(english, 'Europe/Berlin', expected).find((r) => r.id === 'language')
        ?.status,
    ).toBe('fail');
    expect(
      analyzePageSample(english, 'Europe/Berlin').find((r) => r.id === 'language')?.status,
    ).toBe('pass'); // default is English
  });
  it('audit: same', () => {
    const obs: AuditObservation = {
      now: sample.now,
      tz: 'Europe/Berlin',
      offset: -60,
      dateString: '',
      calendar: 'gregory',
      numbering: 'latn',
      faCalendar: 'gregory',
      faNumbering: 'latn',
      faSample: '1',
      language: 'de-DE',
      languages: ['de-DE', 'de', 'en'],
      voiceLangs: [],
      fonts: [],
      keyA: 'a',
      iceTransportPolicy: 'relay',
    };
    const status = (e?: { languages: string[] }) =>
      analyzeAudit(obs, 'Europe/Berlin', SHIELD_DEFAULTS, 'disable_non_proxied_udp', e).chips.find(
        (c) => c.id === 'language',
      )?.status;
    expect(status({ languages: ['de-DE', 'de', 'en'] })).toBe('ok');
    expect(status()).toBe('bad');
  });
});
