import { beforeEach, describe, expect, it, vi } from 'vitest';
import { iconView } from '../src/shared/badge';
import { applyEnv, ENV_KEY, getEnv, RFP_SHIELDS, setEnv } from '../src/shared/browser-env';
import { protectionPlan } from '../src/shared/plan';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import { DEFAULT_STATE } from '../src/shared/storage';
import type { State } from '../src/shared/types';

let local: Record<string, unknown>;
let writes: number;
let incognito: boolean;
let rfp: boolean | Error;

beforeEach(() => {
  vi.resetModules();
  local = {};
  writes = 0;
  incognito = true;
  rfp = false;
  vi.doMock('../src/background/icons', () => ({ setStatusIcon: vi.fn() }));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in local ? { [key]: local[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          writes++;
          Object.assign(local, items);
        },
      },
    },
    extension: { isAllowedIncognitoAccess: async () => incognito },
    privacy: {
      websites: {
        resistFingerprinting: {
          get: async () => {
            if (rfp instanceof Error) throw rfp;
            return { value: rfp };
          },
          onChange: { addListener: () => undefined },
        },
      },
    },
  });
});

const allOn: State = {
  ...DEFAULT_STATE,
  shields: Object.fromEntries(
    Object.keys(SHIELD_DEFAULTS).map((k) => [k, true]),
  ) as unknown as State['shields'],
};

describe('resistFingerprinting', () => {
  it('switches off exactly the fingerprint-noise shields, keeps timezone, locale and headers', () => {
    const s = applyEnv(allOn, { privateAccess: true, rfp: true }).shields;
    for (const k of RFP_SHIELDS) expect(s[k], k).toBe(false);
    for (const k of ['timezone', 'locale', 'webrtc', 'fonts', 'headers'] as const)
      expect(s[k], k).toBe(true);
    expect(allOn.shields.canvas).toBe(true); // the user's settings are not changed
  });
  it('changes nothing while off', () => {
    expect(applyEnv(allOn, { privateAccess: true, rfp: false })).toBe(allOn);
  });
  it('reaches the protection plan through the Firefox effective state', async () => {
    local[ENV_KEY] = { privateAccess: true, rfp: true };
    const { effectiveState } = await import('../src/platform/firefox/env');
    const plan = protectionPlan(await effectiveState(allOn));
    expect(plan.config.shields.canvas).toBe(false);
    expect(plan.config.shields.timezone).toBe(true);
  });
  it('Chrome uses the state unchanged', async () => {
    const { effectiveState } = await import('../src/platform/chrome/env');
    expect(await effectiveState(allOn)).toBe(allOn);
  });
});

describe('browser facts', () => {
  it('default to "private access allowed, RFP off" and only write real changes', async () => {
    expect(await getEnv()).toEqual({ privateAccess: true, rfp: false });
    await setEnv({ privateAccess: true });
    expect(writes).toBe(0);
    await setEnv({ privateAccess: false });
    await setEnv({ privateAccess: false });
    expect(writes).toBe(1);
  });
  it('refreshEnv reads both from Firefox and survives a failing read', async () => {
    const { refreshEnv } = await import('../src/platform/firefox/env');
    incognito = false;
    rfp = true;
    await refreshEnv();
    expect(await getEnv()).toEqual({ privateAccess: false, rfp: true });
    rfp = new Error('no such setting');
    await refreshEnv();
    expect((await getEnv()).rfp).toBe(false);
  });
});

describe('private-window warning badge', () => {
  const on: State = {
    ...DEFAULT_STATE,
    enabled: true,
    profiles: [{ id: 'p', name: 'p', host: 'h.example', port: 1 }],
    activeProfileId: 'p',
    controlsVerifiedAt: Date.now(),
    detectedExit: {
      ip: '1.2.3.4',
      countryCode: 'DE',
      timezone: 'Europe/Berlin',
    } as State['detectedExit'],
  };
  it('replaces the country badge while private windows are not covered', async () => {
    const { withPrivateWarning } = await import('../src/platform/firefox/proxy');
    const view = withPrivateWarning(iconView(on), on, { privateAccess: false, rfp: false });
    expect(view.badge).toBe('PW!');
    expect(view.title).toContain('Run in Private Windows');
  });
  it('leaves the icon alone when allowed, when off, and over errors', async () => {
    const { withPrivateWarning } = await import('../src/platform/firefox/proxy');
    const allowed = { privateAccess: true, rfp: false };
    const denied = { privateAccess: false, rfp: false };
    expect(withPrivateWarning(iconView(on), on, allowed).badge).toBe('DE');
    const off = { ...on, enabled: false };
    expect(withPrivateWarning(iconView(off), off, denied).badge).toBe('');
    const broken = { ...on, protectionError: 'x' };
    expect(withPrivateWarning(iconView(broken), broken, denied).badge).toBe('!');
  });
});
