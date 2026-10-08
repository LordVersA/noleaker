export interface ProxyProfile {
  id: string;
  name: string;
  host: string;
  port: number;
}

export interface ExitInfo {
  ip: string;
  countryCode: string;
  timezone: string;
  detectedAt: number;
}

/** One switch per shield (see upgrade.md). */
export interface ShieldToggles {
  timezone: boolean;
  locale: boolean;
  geolocation: boolean;
  fonts: boolean;
  webrtc: boolean;
  voices: boolean;
  keyboard: boolean;
  workers: boolean;
  canvas: boolean;
  webgl: boolean;
  audio: boolean;
  clientRects: boolean;
  screen: boolean;
  hardwareConcurrency: boolean;
  deviceMemory: boolean;
  /** DNT / Sec-GPC / If-None-Match (implemented). */
  headers: boolean;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Manual values that win over the exit country's profile. Null means automatic. */
export interface Overrides {
  timezone: string | null;
  locale: string | null;
  acceptLanguage: string | null;
  coordinates: Coordinates | null;
}

/** `english`: en-US everywhere (recommended). `country`: the exit country's locale. */
export type LocaleMode = 'english' | 'country';

export interface State {
  schemaVersion: number;
  routingMode: 'strict' | 'compatibility';
  listUpdates: boolean;
  /** Runtime verification; never exported. */
  protectionError: string | null;
  controlsVerifiedAt: number | null;
  profiles: ProxyProfile[];
  activeProfileId: string | null;
  enabled: boolean;
  killSwitchActive: boolean;
  detectedExit: ExitInfo | null;
  countryOverride: string | null;
  iranDomainsUpdatedAt: number | null;
  extraDirectDomains: string[];
  whitelist: string[];
  shields: ShieldToggles;
  overrides: Overrides;
  localeMode: LocaleMode;
  /** Hide this extension's traces from page scripts as far as practical. Off by default. */
  stealth: boolean;
  /** Google Flow unlock. Default on; it only does anything on Flow pages. */
  flowUnlock: boolean;
  /** Re-detect the exit every minute and follow a change (a server moved to another country). */
  autoExitCheck: boolean;
}
