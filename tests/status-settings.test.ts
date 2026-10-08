import { describe, expect, it } from 'vitest';
import { exportSettings, parseSettings } from '../src/shared/settings';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import { DEFAULT_STATE } from '../src/shared/storage';
import { summarize } from '../src/shared/status';
import type { State } from '../src/shared/types';

const profile = { id: 'a', name: 'Home', host: '127.0.0.1', port: 1080 };
const exit = { ip: '1.1.1.1', countryCode: 'DE', timezone: 'Europe/Berlin', detectedAt: 0 };
const good: State = {
  ...DEFAULT_STATE,
  controlsVerifiedAt: Date.now(),
  enabled: true,
  profiles: [profile],
  activeProfileId: 'a',
  detectedExit: exit,
};

describe('summarize', () => {
  it('off', () => expect(summarize(DEFAULT_STATE).level).toBe('off'));
  it('no profile is bad', () => {
    expect(summarize({ ...DEFAULT_STATE, enabled: true }).level).toBe('bad');
  });
  it('kill switch is bad', () => {
    expect(summarize({ ...good, killSwitchActive: true })).toMatchObject({
      level: 'bad',
      label: 'Blocked',
    });
  });
  it('detecting is a warning', () => {
    expect(summarize({ ...good, detectedExit: null }).level).toBe('warn');
  });
  it('missing timezone is a warning', () => {
    expect(
      summarize({ ...good, detectedExit: { ...exit, timezone: '', countryCode: 'ZZ' } }).level,
    ).toBe('warn');
  });
  it('override is a warning', () => {
    expect(summarize({ ...good, countryOverride: 'JP' }).label).toBe('Override');
  });
  it('all good is ok', () => expect(summarize(good).level).toBe('ok'));
});

describe('settings files', () => {
  it('exports version 7 with all shields', () => {
    const data = JSON.parse(exportSettings(good));
    expect(data.version).toBe(7);
    expect(Object.keys(data.shields)).toHaveLength(Object.keys(SHIELD_DEFAULTS).length);
    expect(data).not.toHaveProperty('advanced');
  });
  it('still reads a version 1 file and maps advanced to shields', () => {
    const v1 = JSON.stringify({
      format: 'noleaker-settings',
      version: 1,
      profiles: [],
      advanced: {
        canvasNoise: true,
        webglSpoof: false,
        screenSpoof: true,
        hardwareConcurrency: true,
        deviceMemory: false,
      },
    });
    const r = parseSettings(v1);
    expect(r.ok && r.patch.shields).toEqual({
      ...SHIELD_DEFAULTS,
      canvas: true,
      screen: true,
      hardwareConcurrency: true,
    });
  });
  it('round-trips v2 shields', () => {
    const state: State = { ...good, shields: { ...SHIELD_DEFAULTS, timezone: false, audio: true } };
    const r = parseSettings(exportSettings(state));
    expect(r.ok && r.patch.shields).toEqual(state.shields);
  });
});

describe('settings import/export', () => {
  const state: State = {
    ...good,
    whitelist: ['a.com'],
    extraDirectDomains: ['b.org'],
    countryOverride: 'JP',
  };

  it('round-trips user configuration only', () => {
    const result = parseSettings(exportSettings(state));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.patch).toMatchObject({
      profiles: [profile],
      activeProfileId: 'a',
      whitelist: ['a.com'],
      extraDirectDomains: ['b.org'],
      countryOverride: 'JP',
    });
    expect(result.patch).not.toHaveProperty('detectedExit');
    expect(result.patch).not.toHaveProperty('killSwitchActive');
  });
  it('rejects garbage', () => {
    expect(parseSettings('nope').ok).toBe(false);
    expect(parseSettings('{"format":"other"}').ok).toBe(false);
    expect(parseSettings('{"format":"noleaker-settings","version":9,"profiles":[]}').ok).toBe(
      false,
    );
  });
  it('rejects invalid proxies without applying anything', () => {
    const bad = JSON.stringify({
      format: 'noleaker-settings',
      version: 1,
      profiles: [{ id: 'x', name: 'X', host: 'bad host', port: 1 }],
    });
    expect(parseSettings(bad)).toMatchObject({ ok: false });
  });
  it('turns the proxy off when the import has no profiles', () => {
    const empty = JSON.stringify({ format: 'noleaker-settings', version: 1, profiles: [] });
    const r = parseSettings(empty);
    expect(r.ok && r.patch.enabled).toBe(false);
  });
  it('cleans domain lists and ignores bad country codes', () => {
    const text = JSON.stringify({
      format: 'noleaker-settings',
      version: 1,
      profiles: [],
      whitelist: ['HTTPS://Ok.com/x', 'bad domain', 5],
      countryOverride: 'xx1',
    });
    const r = parseSettings(text);
    expect(r.ok && r.patch.whitelist).toEqual(['ok.com']);
    expect(r.ok && r.patch.countryOverride).toBeNull();
  });
});
