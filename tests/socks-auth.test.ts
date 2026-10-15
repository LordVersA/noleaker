import { describe, expect, it } from 'vitest';
import { exportSettings, parseSettings } from '../src/shared/settings';
import { DEFAULT_STATE, migrateState } from '../src/shared/storage';
import { validateCredentials } from '../src/shared/validate';

describe('SOCKS5 credentials', () => {
  it('are optional, but a username and password go together and fit RFC 1929', () => {
    expect(validateCredentials('', '')).toBeNull();
    expect(validateCredentials('user', 'secret')).toBeNull();
    expect(validateCredentials('user', '')).toMatch(/password/);
    expect(validateCredentials('', 'secret')).toMatch(/username/);
    expect(validateCredentials('x'.repeat(256), 'p')).toMatch(/255/);
    expect(validateCredentials('u', 'é'.repeat(128))).toMatch(/255/); // 256 bytes
  });
  it('survive export and import, and profiles without them stay without', () => {
    const state = {
      ...DEFAULT_STATE,
      profiles: [
        { id: 'a', name: 'auth', host: 'h.example', port: 1080, username: 'u', password: 'p' },
        { id: 'b', name: 'open', host: 'o.example', port: 1080 },
      ],
      activeProfileId: 'a',
    };
    const result = parseSettings(exportSettings(state));
    expect(result.ok && result.patch.profiles).toEqual(state.profiles);
  });
  it('ignores junk credential fields', () => {
    const file = JSON.parse(exportSettings(DEFAULT_STATE));
    file.profiles = [{ id: 'a', name: 'a', host: 'h.example', port: 1, username: 5, password: {} }];
    const result = parseSettings(JSON.stringify(file));
    expect(result.ok && result.patch.profiles).toEqual([
      { id: 'a', name: 'a', host: 'h.example', port: 1 },
    ]);
  });
  it('rejects an import whose credentials break RFC 1929', () => {
    const file = JSON.parse(exportSettings(DEFAULT_STATE));
    file.profiles = [{ id: 'a', name: 'a', host: 'h.example', port: 1, username: 'u' }];
    expect(parseSettings(JSON.stringify(file))).toMatchObject({ ok: false });
    file.profiles[0].password = 'x'.repeat(256);
    expect(parseSettings(JSON.stringify(file))).toMatchObject({ ok: false });
  });
  it('stored state keeps credentials only as a pair of strings', () => {
    const profiles = [
      { id: 'a', name: 'a', host: 'h', port: 1, username: 'u', password: 'p' },
      { id: 'b', name: 'b', host: 'h', port: 1, username: 5, password: {} },
      { id: 'c', name: 'c', host: 'h', port: 1, username: 'u' },
    ];
    expect(migrateState({ ...DEFAULT_STATE, profiles }).profiles).toEqual([
      profiles[0],
      { id: 'b', name: 'b', host: 'h', port: 1 },
      { id: 'c', name: 'c', host: 'h', port: 1 },
    ]);
  });
});
