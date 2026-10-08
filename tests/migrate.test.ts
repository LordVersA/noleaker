import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import { LOG_KEY, MAX_ENTRIES, log, readLog } from '../src/shared/log';
import {
  DEFAULT_STATE,
  migrateState,
  persistMigration,
  SCHEMA_VERSION,
} from '../src/shared/storage';

const profile = { id: 'a', name: 'a', host: 'h.com', port: 1080 };

describe('migrateState', () => {
  it('returns defaults for garbage', () => {
    expect(migrateState(undefined)).toEqual(DEFAULT_STATE);
    expect(migrateState('x')).toEqual(DEFAULT_STATE);
    expect(migrateState([1])).toEqual(DEFAULT_STATE);
  });
  it('migrates v1: drops iranDomains and splits hardwareSpoof', () => {
    const old = {
      schemaVersion: 1,
      iranDomains: ['a.com'],
      profiles: [profile],
      activeProfileId: 'a',
      advanced: { canvasNoise: true, hardwareSpoof: true },
    };
    const s = migrateState(old);
    expect(s).not.toHaveProperty('iranDomains');
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s).not.toHaveProperty('advanced');
    // the five old fingerprint switches carry over, the new shields get their defaults
    expect(s.shields).toEqual({
      ...SHIELD_DEFAULTS,
      canvas: true,
      hardwareConcurrency: true,
      deviceMemory: true,
    });
  });
  it('migrates v2: advanced becomes shields without losing a toggle', () => {
    const s = migrateState({
      schemaVersion: 2,
      advanced: {
        canvasNoise: true,
        webglSpoof: true,
        screenSpoof: true,
        hardwareConcurrency: false,
        deviceMemory: true,
      },
    });
    expect(s.shields).toMatchObject({
      canvas: true,
      webgl: true,
      screen: true,
      hardwareConcurrency: false,
      deviceMemory: true,
      timezone: true,
      locale: true,
      webrtc: true,
    });
    expect(s).not.toHaveProperty('advanced');
  });
  it('keeps v3 shields and fills missing or malformed keys', () => {
    const s = migrateState({ schemaVersion: 3, shields: { timezone: false, canvas: 'yes' } });
    expect(s.shields.timezone).toBe(false);
    expect(s.shields.canvas).toBe(false);
    expect(s.shields.locale).toBe(true);
  });
  it('repairs wrong types and dangling references', () => {
    const s = migrateState({
      schemaVersion: SCHEMA_VERSION,
      profiles: [profile, { id: 5 }, 'junk'],
      whitelist: 'nope',
      enabled: 'yes',
      activeProfileId: 'missing',
    });
    expect(s.profiles).toEqual([profile]);
    expect(s.whitelist).toEqual([]);
    expect(s.enabled).toBe(false);
    expect(s.activeProfileId).toBe('a');
  });
  it('turns the proxy off when no profile survives', () => {
    expect(
      migrateState({ schemaVersion: SCHEMA_VERSION, enabled: true, profiles: [] }).enabled,
    ).toBe(false);
  });
  it('keeps a newer schema version', () => {
    expect(migrateState({ schemaVersion: 99 }).schemaVersion).toBe(99);
  });
});

describe('storage with a fake chrome', () => {
  let store: Record<string, unknown>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(store, items),
          remove: async (key: string) => void delete store[key],
        },
      },
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('persistMigration writes old state once', async () => {
    store.state = { schemaVersion: 1, iranDomains: ['x.com'] };
    expect(await persistMigration()).toBe(true);
    expect(store.state).not.toHaveProperty('iranDomains');
    expect(await persistMigration()).toBe(false);
  });

  it('log keeps only the newest entries and truncates long messages', async () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) log('info', `event ${i}`);
    log('warn', 'x'.repeat(1000));
    await new Promise((r) => setTimeout(r, 50));
    const entries = await readLog();
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries.at(-1)?.msg).toHaveLength(300);
    expect(entries[0]?.msg).toBe('event 6');
    expect(LOG_KEY in store).toBe(true);
  });
});
