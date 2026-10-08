import { defaultTimezone } from './countries';
import type { ExitInfo, State } from './types';

export interface EffectiveExit {
  countryCode: string;
  timezone: string | null;
  ip: string | null;
  overridden: boolean;
}

/** Country/timezone the rest of the extension should use: manual override wins over detection. */
export function effectiveExit(state: State): EffectiveExit | null {
  const detected = state.detectedExit;
  const override = state.countryOverride;
  if (override && override !== detected?.countryCode) {
    return {
      countryCode: override,
      timezone: defaultTimezone(override),
      ip: detected?.ip ?? null,
      overridden: true,
    };
  }
  if (!detected) return null;
  return {
    countryCode: detected.countryCode,
    timezone: detected.timezone || defaultTimezone(detected.countryCode),
    ip: detected.ip,
    overridden: false,
  };
}

/** Result of a manual or scheduled exit check. */
export interface ExitRefresh {
  ok: boolean;
  /** The detected IP or country differs from what was stored before (never true on a first detection). */
  changed: boolean;
  /** What the check saw; absent when it failed. */
  exit?: { ip: string; countryCode: string };
  /** What was stored before the check. */
  previous?: { ip: string; countryCode: string };
  error?: string;
}

/** How a freshly detected exit differs from the stored one. */
export function describeExitChange(
  previous: Pick<ExitInfo, 'ip' | 'countryCode'> | null,
  next: Pick<ExitInfo, 'ip' | 'countryCode'>,
): 'first' | 'country' | 'ip' | 'same' {
  if (!previous) return 'first';
  if (previous.countryCode !== next.countryCode) return 'country';
  return previous.ip !== next.ip ? 'ip' : 'same';
}

/**
 * Should a check store the exit it found? A manual refresh always does; the scheduled check does
 * when "check every minute" is on, or when there is no exit yet. Otherwise it only watches
 * reachability (the kill switch) and leaves the stored exit alone.
 */
export function shouldStoreExit(
  state: Pick<State, 'autoExitCheck' | 'detectedExit'>,
  force: boolean,
) {
  return force || state.autoExitCheck || state.detectedExit === null;
}
