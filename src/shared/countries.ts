import { COUNTRY_PROFILES } from './country-profiles';

/** Country code -> display name and default IANA timezone. A view of `COUNTRY_PROFILES`. */
export const COUNTRIES: Record<string, { name: string; timezone: string }> = Object.fromEntries(
  Object.entries(COUNTRY_PROFILES).map(([code, p]) => [
    code,
    { name: p.name, timezone: p.timezone },
  ]),
);

export function defaultTimezone(countryCode: string): string | null {
  return COUNTRIES[countryCode]?.timezone ?? null;
}
