import { COUNTRY_PROFILES } from './country-profiles';
import { effectiveExit } from './exit';
import { autoIdentity, resolveIdentity } from './identity';
import type { Coordinates, State } from './types';

export interface OverrideWarning {
  id: 'timezone' | 'persian' | 'region' | 'coordinates';
  message: string;
}

/** Largest angle (degrees of arc) between a manual point and the country's point before we warn. */
export const MAX_COORDINATE_DISTANCE = 12;

/** Great-circle distance between two points, as an angle in degrees. */
export function angularDistance(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.latitude * rad) * Math.sin(b.latitude * rad) +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.cos((a.longitude - b.longitude) * rad);
  return Math.acos(Math.max(-1, Math.min(1, cos))) / rad;
}

const PERSIAN = /^fa([-_]|$)/i;

/**
 * Things a manual override (or the "match exit country" setting) can get wrong. Shown in the
 * options page and the popup. Nothing here blocks anything; it only tells you.
 */
export function checkOverrides(state: State): OverrideWarning[] {
  const warnings: OverrideWarning[] = [];
  const o = state.overrides;
  const exit = effectiveExit(state);
  const profile = exit ? COUNTRY_PROFILES[exit.countryCode] : undefined;
  const auto = autoIdentity(state);
  const used = resolveIdentity(state);

  if (o.timezone && auto.timezone && o.timezone !== auto.timezone) {
    warnings.push({
      id: 'timezone',
      message: `Timezone ${o.timezone} differs from the exit country's (${auto.timezone}).`,
    });
  }

  if ([used.locale, ...used.languages].some((tag) => PERSIAN.test(tag))) {
    warnings.push({
      id: 'persian',
      message: 'A Persian language setting (fa) tells sites that you are Iranian.',
    });
  }

  if (o.locale && exit) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(o.locale).region;
    } catch {
      region = undefined;
    }
    if (region && region !== exit.countryCode) {
      warnings.push({
        id: 'region',
        message: `Locale ${o.locale} is for ${region}, but the exit country is ${exit.countryCode}.`,
      });
    }
  }

  if (o.coordinates && profile) {
    const distance = angularDistance(o.coordinates, profile);
    if (distance > MAX_COORDINATE_DISTANCE) {
      warnings.push({
        id: 'coordinates',
        message: `The coordinates are about ${Math.round(distance)}° from the exit country (${profile.name}).`,
      });
    }
  }
  return warnings;
}
