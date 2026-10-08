import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../src/shared/storage';
import { removeProfile, upsertProfile } from '../src/shared/profiles';
import { validateProfile } from '../src/shared/validate';

const p = (id: string) => ({ id, name: id, host: 'h.com', port: 1080 });

describe('profiles', () => {
  it('first profile becomes active', () => {
    expect(upsertProfile(DEFAULT_STATE, p('a')).activeProfileId).toBe('a');
  });
  it('editing replaces in place', () => {
    const s = { ...DEFAULT_STATE, profiles: [p('a')], activeProfileId: 'a' };
    expect(upsertProfile(s, { ...p('a'), port: 2 }).profiles).toEqual([{ ...p('a'), port: 2 }]);
  });
  it('removing the last active profile turns the proxy off', () => {
    const s = { ...DEFAULT_STATE, profiles: [p('a')], activeProfileId: 'a', enabled: true };
    expect(removeProfile(s, 'a')).toEqual({ profiles: [], activeProfileId: null, enabled: false });
  });
  it('removing active profile falls back to another', () => {
    const s = { ...DEFAULT_STATE, profiles: [p('a'), p('b')], activeProfileId: 'a', enabled: true };
    expect(removeProfile(s, 'a').activeProfileId).toBe('b');
  });
});

describe('validateProfile', () => {
  it('accepts valid', () => expect(validateProfile('x', '127.0.0.1', 1080)).toBeNull());
  it('rejects bad input', () => {
    expect(validateProfile('', 'a.com', 1)).not.toBeNull();
    expect(validateProfile('x', 'bad host', 1)).not.toBeNull();
    expect(validateProfile('x', 'a.com', 0)).not.toBeNull();
    expect(validateProfile('x', 'a.com', 70000)).not.toBeNull();
  });
});
