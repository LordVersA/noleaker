import type { Coordinates, Overrides } from './types';

export const NO_OVERRIDES: Overrides = {
  timezone: null,
  locale: null,
  acceptLanguage: null,
  coordinates: null,
};

export type OverrideField = 'timezone' | 'locale' | 'acceptLanguage' | 'coordinates';

/** A valid IANA timezone in its canonical spelling ("europe/berlin" -> "Europe/Berlin"), or null. */
export function normalizeTimezone(input: string): string | null {
  const name = input.trim();
  if (!name) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** A canonical BCP 47 language tag ("de-de" -> "de-DE"), or null. */
export function normalizeLocale(input: string): string | null {
  const tag = input.trim();
  if (!tag || tag === '*') return null;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

/** `de-DE,de;q=0.9,en;q=0.8`: tags with an optional weight. Returns the normalised header or null. */
export function normalizeAcceptLanguage(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > 200) return null;
  const parts: string[] = [];
  for (const raw of text.split(',')) {
    const [tagPart, ...params] = raw.trim().split(';');
    const tag = normalizeLocale(tagPart ?? '');
    if (!tag) return null;
    let weight = '';
    for (const p of params) {
      const m = /^\s*q\s*=\s*(0(?:\.\d{1,3})?|1(?:\.0{1,3})?)\s*$/.exec(p);
      if (!m) return null;
      weight = `;q=${m[1]}`;
    }
    parts.push(tag + weight);
  }
  return parts.join(',');
}

/** The language tags of an Accept-Language value, in order and without weights. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => part.split(';')[0]!.trim())
    .filter((tag) => tag && tag !== '*');
}

export interface OverrideInput {
  timezone: string;
  locale: string;
  acceptLanguage: string;
  latitude: string;
  longitude: string;
}

export interface ValidatedOverrides {
  overrides: Overrides;
  errors: Partial<Record<OverrideField, string>>;
}

/** Validate the options-page fields. Empty means automatic. */
export function validateOverrideInput(input: OverrideInput): ValidatedOverrides {
  const errors: ValidatedOverrides['errors'] = {};
  const overrides: Overrides = { ...NO_OVERRIDES };

  if (input.timezone.trim()) {
    overrides.timezone = normalizeTimezone(input.timezone);
    if (!overrides.timezone)
      errors.timezone = 'Not a valid IANA timezone, for example Europe/Berlin.';
  }
  if (input.locale.trim()) {
    overrides.locale = normalizeLocale(input.locale);
    if (!overrides.locale) errors.locale = 'Not a valid language tag, for example de-DE.';
  }
  if (input.acceptLanguage.trim()) {
    overrides.acceptLanguage = normalizeAcceptLanguage(input.acceptLanguage);
    if (!overrides.acceptLanguage) {
      errors.acceptLanguage =
        'Use tags with optional weights, for example de-DE,de;q=0.9,en;q=0.8.';
    }
  }

  const lat = input.latitude.trim();
  const lon = input.longitude.trim();
  if (lat || lon) {
    const latitude = lat === '' ? NaN : Number(lat);
    const longitude = lon === '' ? NaN : Number(lon);
    if (!lat || !lon)
      errors.coordinates = 'Enter both latitude and longitude, or leave both empty.';
    else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.coordinates = 'Latitude must be a number between -90 and 90.';
    } else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.coordinates = 'Longitude must be a number between -180 and 180.';
    } else overrides.coordinates = { latitude, longitude };
  }
  return { overrides, errors };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Make stored or imported data safe: anything invalid becomes automatic (null). */
export function sanitizeOverrides(raw: unknown): Overrides {
  if (!isRecord(raw)) return { ...NO_OVERRIDES };
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  let coordinates: Coordinates | null = null;
  if (isRecord(raw.coordinates)) {
    const { latitude, longitude } = raw.coordinates;
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      coordinates = { latitude, longitude };
    }
  }
  return {
    timezone: normalizeTimezone(text(raw.timezone)),
    locale: normalizeLocale(text(raw.locale)),
    acceptLanguage: normalizeAcceptLanguage(text(raw.acceptLanguage)),
    coordinates,
  };
}
