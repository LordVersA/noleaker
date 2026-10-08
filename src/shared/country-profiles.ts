/**
 * The one country table. Per country: display name, default IANA timezone, a locale and
 * Accept-Language for the optional "match exit country" setting, and a representative point
 * (a major city in that timezone) for geolocation.
 */
export interface CountryProfile {
  name: string;
  timezone: string;
  locale: string;
  acceptLanguage: string;
  latitude: number;
  longitude: number;
}

// code: [name, timezone, locale, latitude, longitude]
const RAW: Record<string, [string, string, string, number, number]> = {
  AE: ['United Arab Emirates', 'Asia/Dubai', 'ar-AE', 24.47, 54.37],
  AM: ['Armenia', 'Asia/Yerevan', 'hy-AM', 40.18, 44.51],
  AR: ['Argentina', 'America/Argentina/Buenos_Aires', 'es-AR', -34.6, -58.38],
  AT: ['Austria', 'Europe/Vienna', 'de-AT', 48.21, 16.37],
  AU: ['Australia', 'Australia/Sydney', 'en-AU', -33.87, 151.21],
  AZ: ['Azerbaijan', 'Asia/Baku', 'az-AZ', 40.41, 49.87],
  BE: ['Belgium', 'Europe/Brussels', 'nl-BE', 50.85, 4.35],
  BG: ['Bulgaria', 'Europe/Sofia', 'bg-BG', 42.7, 23.32],
  BR: ['Brazil', 'America/Sao_Paulo', 'pt-BR', -23.55, -46.63],
  CA: ['Canada', 'America/Toronto', 'en-CA', 43.65, -79.38],
  CH: ['Switzerland', 'Europe/Zurich', 'de-CH', 47.38, 8.54],
  CL: ['Chile', 'America/Santiago', 'es-CL', -33.45, -70.67],
  CN: ['China', 'Asia/Shanghai', 'zh-CN', 31.23, 121.47],
  CO: ['Colombia', 'America/Bogota', 'es-CO', 4.71, -74.07],
  CY: ['Cyprus', 'Asia/Nicosia', 'el-CY', 35.17, 33.36],
  CZ: ['Czechia', 'Europe/Prague', 'cs-CZ', 50.08, 14.44],
  DE: ['Germany', 'Europe/Berlin', 'de-DE', 52.52, 13.4],
  DK: ['Denmark', 'Europe/Copenhagen', 'da-DK', 55.68, 12.57],
  EE: ['Estonia', 'Europe/Tallinn', 'et-EE', 59.44, 24.75],
  EG: ['Egypt', 'Africa/Cairo', 'ar-EG', 30.04, 31.24],
  ES: ['Spain', 'Europe/Madrid', 'es-ES', 40.42, -3.7],
  FI: ['Finland', 'Europe/Helsinki', 'fi-FI', 60.17, 24.94],
  FR: ['France', 'Europe/Paris', 'fr-FR', 48.86, 2.35],
  GB: ['United Kingdom', 'Europe/London', 'en-GB', 51.51, -0.13],
  GE: ['Georgia', 'Asia/Tbilisi', 'ka-GE', 41.72, 44.79],
  GR: ['Greece', 'Europe/Athens', 'el-GR', 37.98, 23.73],
  HK: ['Hong Kong', 'Asia/Hong_Kong', 'zh-HK', 22.32, 114.17],
  HU: ['Hungary', 'Europe/Budapest', 'hu-HU', 47.5, 19.04],
  ID: ['Indonesia', 'Asia/Jakarta', 'id-ID', -6.21, 106.85],
  IE: ['Ireland', 'Europe/Dublin', 'en-IE', 53.35, -6.26],
  IL: ['Israel', 'Asia/Jerusalem', 'he-IL', 31.77, 35.22],
  IN: ['India', 'Asia/Kolkata', 'en-IN', 28.61, 77.21],
  IR: ['Iran', 'Asia/Tehran', 'fa-IR', 35.69, 51.39],
  IS: ['Iceland', 'Atlantic/Reykjavik', 'is-IS', 64.15, -21.94],
  IT: ['Italy', 'Europe/Rome', 'it-IT', 41.9, 12.5],
  JP: ['Japan', 'Asia/Tokyo', 'ja-JP', 35.68, 139.69],
  KR: ['South Korea', 'Asia/Seoul', 'ko-KR', 37.57, 126.98],
  KZ: ['Kazakhstan', 'Asia/Almaty', 'kk-KZ', 43.24, 76.89],
  LT: ['Lithuania', 'Europe/Vilnius', 'lt-LT', 54.69, 25.28],
  LU: ['Luxembourg', 'Europe/Luxembourg', 'fr-LU', 49.61, 6.13],
  LV: ['Latvia', 'Europe/Riga', 'lv-LV', 56.95, 24.11],
  MD: ['Moldova', 'Europe/Chisinau', 'ro-MD', 47.01, 28.86],
  MX: ['Mexico', 'America/Mexico_City', 'es-MX', 19.43, -99.13],
  MY: ['Malaysia', 'Asia/Kuala_Lumpur', 'ms-MY', 3.14, 101.69],
  NL: ['Netherlands', 'Europe/Amsterdam', 'nl-NL', 52.37, 4.9],
  NO: ['Norway', 'Europe/Oslo', 'nb-NO', 59.91, 10.75],
  NZ: ['New Zealand', 'Pacific/Auckland', 'en-NZ', -36.85, 174.76],
  PL: ['Poland', 'Europe/Warsaw', 'pl-PL', 52.23, 21.01],
  PT: ['Portugal', 'Europe/Lisbon', 'pt-PT', 38.72, -9.14],
  RO: ['Romania', 'Europe/Bucharest', 'ro-RO', 44.43, 26.1],
  RS: ['Serbia', 'Europe/Belgrade', 'sr-RS', 44.79, 20.45],
  RU: ['Russia', 'Europe/Moscow', 'ru-RU', 55.76, 37.62],
  SA: ['Saudi Arabia', 'Asia/Riyadh', 'ar-SA', 24.71, 46.68],
  SE: ['Sweden', 'Europe/Stockholm', 'sv-SE', 59.33, 18.07],
  SG: ['Singapore', 'Asia/Singapore', 'en-SG', 1.35, 103.82],
  SK: ['Slovakia', 'Europe/Bratislava', 'sk-SK', 48.15, 17.11],
  TH: ['Thailand', 'Asia/Bangkok', 'th-TH', 13.76, 100.5],
  TR: ['Turkey', 'Europe/Istanbul', 'tr-TR', 41.01, 28.98],
  TW: ['Taiwan', 'Asia/Taipei', 'zh-TW', 25.03, 121.57],
  UA: ['Ukraine', 'Europe/Kyiv', 'uk-UA', 50.45, 30.52],
  US: ['United States', 'America/New_York', 'en-US', 40.71, -74.01],
  VN: ['Vietnam', 'Asia/Ho_Chi_Minh', 'vi-VN', 10.82, 106.63],
  ZA: ['South Africa', 'Africa/Johannesburg', 'en-ZA', -26.2, 28.05],
};

/** `de-DE` -> `de-DE,de;q=0.9,en;q=0.8`; English locales -> `en-GB,en;q=0.9`. */
export function acceptLanguageFor(locale: string): string {
  const lang = locale.split('-')[0]!;
  return lang === 'en' ? `${locale},en;q=0.9` : `${locale},${lang};q=0.9,en;q=0.8`;
}

export const COUNTRY_PROFILES: Record<string, CountryProfile> = Object.fromEntries(
  Object.entries(RAW).map(([code, [name, timezone, locale, latitude, longitude]]) => [
    code,
    { name, timezone, locale, acceptLanguage: acceptLanguageFor(locale), latitude, longitude },
  ]),
);
