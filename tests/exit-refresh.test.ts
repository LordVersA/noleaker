import { describe, expect, it } from 'vitest';
import { describeExitChange, shouldStoreExit } from '../src/shared/exit';
import { exportSettings, parseSettings } from '../src/shared/settings';
import { DEFAULT_STATE, migrateState, SCHEMA_VERSION } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const fr = { ip: '1.1.1.1', countryCode: 'FR' };

describe('describeExitChange', () => {
  it('tells a first detection, a new country, a new IP and no change apart', () => {
    expect(describeExitChange(null, fr)).toBe('first');
    expect(describeExitChange(fr, { ip: '2.2.2.2', countryCode: 'DE' })).toBe('country');
    expect(describeExitChange(fr, { ip: '9.9.9.9', countryCode: 'FR' })).toBe('ip');
    expect(describeExitChange(fr, { ...fr })).toBe('same');
  });
  it('a country change wins over an IP change', () => {
    expect(describeExitChange(fr, { ip: '1.1.1.1', countryCode: 'NL' })).toBe('country');
  });
});

describe('shouldStoreExit', () => {
  const exit = { ...fr, timezone: 'Europe/Paris', detectedAt: 0 };
  it('the scheduled check follows the exit only while "check every minute" is on', () => {
    expect(shouldStoreExit({ autoExitCheck: true, detectedExit: exit }, false)).toBe(true);
    expect(shouldStoreExit({ autoExitCheck: false, detectedExit: exit }, false)).toBe(false);
  });
  it('a manual refresh always stores, and the first detection is never skipped', () => {
    expect(shouldStoreExit({ autoExitCheck: false, detectedExit: exit }, true)).toBe(true);
    expect(shouldStoreExit({ autoExitCheck: false, detectedExit: null }, false)).toBe(true);
  });
});

describe('autoExitCheck in state and files', () => {
  it('is on by default, for new and old stored data', () => {
    expect(DEFAULT_STATE.autoExitCheck).toBe(true);
    const old = migrateState({ schemaVersion: 6, stealth: true });
    expect(old.autoExitCheck).toBe(true);
    expect(old.schemaVersion).toBe(SCHEMA_VERSION);
    expect(old.stealth).toBe(true);
  });
  it('keeps an explicit off and ignores junk', () => {
    expect(migrateState({ schemaVersion: 7, autoExitCheck: false }).autoExitCheck).toBe(false);
    expect(migrateState({ schemaVersion: 7, autoExitCheck: 'no' }).autoExitCheck).toBe(true);
  });
  it('round-trips through export and import, and reads older files', () => {
    const off: State = { ...DEFAULT_STATE, autoExitCheck: false };
    const exported = JSON.parse(exportSettings(off));
    expect(exported.version).toBe(7);
    expect(exported.autoExitCheck).toBe(false);
    const back = parseSettings(exportSettings(off));
    expect(back.ok && back.patch.autoExitCheck).toBe(false);
    const v5 = parseSettings(JSON.stringify({ ...exported, version: 5, autoExitCheck: undefined }));
    expect(v5.ok && v5.patch.autoExitCheck).toBe(true);
  });
});
