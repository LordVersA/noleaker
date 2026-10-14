import type { ShieldToggles, State } from './types';

// Browser facts that change what noleaker can protect (Firefox build). Kept outside State: they
// are read from the browser, not chosen by the user, and never exported.

export interface BrowserEnv {
  /** "Run in Private Windows" is allowed. Without it, private windows bypass noleaker entirely. */
  privateAccess: boolean;
  /** privacy.resistFingerprinting is on: Firefox already disguises the fingerprint. */
  rfp: boolean;
}

export const ENV_KEY = 'browserEnv';
export const DEFAULT_ENV: BrowserEnv = { privateAccess: true, rfp: false };

export async function getEnv(): Promise<BrowserEnv> {
  const stored = (await chrome.storage.local.get(ENV_KEY))[ENV_KEY] as
    Partial<BrowserEnv> | undefined;
  return { ...DEFAULT_ENV, ...stored };
}

/** Write only real changes: listeners react to every write. */
export async function setEnv(patch: Partial<BrowserEnv>): Promise<void> {
  const current = await getEnv();
  const next = { ...current, ...patch };
  if (next.privateAccess !== current.privateAccess || next.rfp !== current.rfp)
    await chrome.storage.local.set({ [ENV_KEY]: next });
}

/**
 * Fingerprint shields that resistFingerprinting replaces. Our noise on top of RFP's uniform values
 * would make the browser stand out, so they are switched off while RFP is on. Timezone and locale
 * stay ours: they follow the exit country, RFP's UTC/en-US do not.
 */
export const RFP_SHIELDS: readonly (keyof ShieldToggles)[] = [
  'canvas',
  'webgl',
  'audio',
  'clientRects',
  'screen',
  'hardwareConcurrency',
  'deviceMemory',
];

/** The state protection should use: the user's settings with RFP's overrides applied. */
export function applyEnv(state: State, env: BrowserEnv): State {
  if (!env.rfp) return state;
  const shields = { ...state.shields };
  for (const key of RFP_SHIELDS) shields[key] = false;
  return { ...state, shields };
}

export const PRIVATE_WARNING =
  'Private windows are not protected: allow "Run in Private Windows" for noleaker in about:addons. Until then they connect without the proxy.';

export const RFP_NOTE =
  "Firefox's resistFingerprinting is on, so noleaker's fingerprint shields (canvas, WebGL, audio, client rects, screen, CPU, memory) are switched off. Timezone and locale still follow the exit country.";
