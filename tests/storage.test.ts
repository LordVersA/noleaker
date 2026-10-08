import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, getState, setState, updateState } from '../src/shared/storage';

let store: Record<string, unknown> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => void Object.assign(store, items),
      },
    },
  });
});

describe('storage', () => {
  it('returns defaults when empty', async () => {
    expect(await getState()).toEqual(DEFAULT_STATE);
  });

  it('merges a patch and persists it', async () => {
    await setState({ countryOverride: 'DE' });
    expect((await getState()).countryOverride).toBe('DE');
  });

  it('fills missing shield keys from defaults', async () => {
    store.state = { shields: { canvas: true } };
    const s = await getState();
    expect(s.shields).toEqual({ ...DEFAULT_STATE.shields, canvas: true });
  });

  it('updateState derives from the current state', async () => {
    await setState({ whitelist: ['a.com'] });
    await updateState((s) => ({ whitelist: [...s.whitelist, 'b.com'] }));
    expect((await getState()).whitelist).toEqual(['a.com', 'b.com']);
  });
});
