import { acceptLanguageFor, COUNTRY_PROFILES } from './country-profiles';
import { effectiveExit } from './exit';
import { parseAcceptLanguage } from './overrides';
import type { Coordinates, State } from './types';

/** The English default (DESIGN.md decision 4): not tied to the exit country. */
export const ENGLISH_LOCALE = 'en-US';
export const ENGLISH_ACCEPT_LANGUAGE = acceptLanguageFor(ENGLISH_LOCALE);

/** What the browser should claim to be: timezone, language and position. */
export interface Identity {
  /** Null while the exit (or its timezone) is unknown. */
  timezone: string | null;
  locale: string;
  acceptLanguage: string;
  /** The tags of `acceptLanguage`; `languages[0]` is `navigator.language`. */
  languages: string[];
  coordinates: Coordinates | null;
}

function build(
  state: State,
  timezone: string | null,
  locale: string | null,
  acceptLanguage: string | null,
  coordinates: Coordinates | null,
): Identity {
  const exit = effectiveExit(state);
  const profile = exit ? COUNTRY_PROFILES[exit.countryCode] : undefined;
  const useCountry = state.localeMode === 'country' && !!profile;

  const finalLocale = locale ?? (useCountry ? profile!.locale : ENGLISH_LOCALE);
  // A manual locale without a manual Accept-Language gets the header that fits it.
  const finalAcceptLanguage =
    acceptLanguage ??
    (locale
      ? acceptLanguageFor(locale)
      : useCountry
        ? profile!.acceptLanguage
        : ENGLISH_ACCEPT_LANGUAGE);

  return {
    timezone: timezone ?? exit?.timezone ?? null,
    locale: finalLocale,
    acceptLanguage: finalAcceptLanguage,
    languages: parseAcceptLanguage(finalAcceptLanguage),
    coordinates:
      coordinates ??
      (profile ? { latitude: profile.latitude, longitude: profile.longitude } : null),
  };
}

/** What noleaker picks by itself (no manual overrides). The baseline for "currently automatic". */
export function autoIdentity(state: State): Identity {
  return build(state, null, null, null, null);
}

/** The identity in use: manual overrides win over the exit country's profile. */
export function resolveIdentity(state: State): Identity {
  const o = state.overrides;
  return build(state, o.timezone, o.locale, o.acceptLanguage, o.coordinates);
}
