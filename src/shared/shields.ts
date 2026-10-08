import type { ShieldToggles } from './types';

export type ShieldGroup = 'country' | 'fingerprint';

export interface ShieldInfo {
  key: keyof ShieldToggles;
  group: ShieldGroup;
  label: string;
  description: string;
  /** A longer explanation, shown in the hint bubble next to the switch. */
  hint: string;
  /** False while the shield has a switch but no behaviour yet (later upgrade phases). */
  implemented: boolean;
}

/**
 * Country-linked shields default to on; fingerprint-noise shields default to off, because
 * partial spoofing can make the browser more unique (DESIGN.md decision 12).
 */
export const SHIELD_DEFAULTS: ShieldToggles = {
  timezone: true,
  locale: true,
  geolocation: true,
  fonts: true,
  webrtc: true,
  voices: true,
  keyboard: true,
  workers: true,
  canvas: false,
  webgl: false,
  audio: false,
  clientRects: false,
  screen: false,
  hardwareConcurrency: false,
  deviceMemory: false,
  headers: false,
};

export const SHIELDS: ShieldInfo[] = [
  {
    key: 'timezone',
    group: 'country',
    implemented: true,
    label: 'Timezone',
    description: 'Date and Intl report the exit country’s timezone.',
    hint: "Pages read your timezone through Date and Intl. With this on they see the exit country's timezone instead of your system's, so it agrees with your IP address. Turn it off only if a site misbehaves.",
  },
  {
    key: 'locale',
    group: 'country',
    implemented: true,
    label: 'Language',
    description: 'English language and Accept-Language, whatever your system uses.',
    hint: "Sets navigator.language(s) and the Accept-Language header, so sites see English (or the exit country's language if you chose that under Overrides). Pages that translate by language will show that language.",
  },
  {
    key: 'webrtc',
    group: 'country',
    implemented: true,
    label: 'WebRTC',
    description:
      'Only proxied UDP, and relay-only ICE for pages. Turning this off can leak your real IP.',
    hint: 'WebRTC can reveal your real IP address outside the proxy. This limits it to proxied UDP and relay-only connections. Turning it off can leak your real IP, so leave it on.',
  },
  {
    key: 'geolocation',
    group: 'country',
    implemented: true,
    label: 'Geolocation',
    description: 'Reports a position in the exit country.',
    hint: 'navigator.geolocation answers with a point inside the exit country and reports the permission as granted, so a site that asks where you are gets an answer that matches your IP.',
  },
  {
    key: 'fonts',
    group: 'country',
    implemented: true,
    label: 'Persian fonts',
    description: 'Hides Persian font families from pages.',
    hint: 'Persian font families are removed from font checks, so a site cannot tell they are installed. A font the page loads itself is never hidden. If Persian pages look wrong, turn this off.',
  },
  {
    key: 'voices',
    group: 'country',
    implemented: true,
    label: 'Speech voices',
    description: 'Hides Persian text-to-speech voices.',
    hint: 'Text-to-speech voices for Persian are left out of speechSynthesis.getVoices(), because an installed Persian voice is a strong sign of where you are from.',
  },
  {
    key: 'keyboard',
    group: 'country',
    implemented: true,
    label: 'Keyboard layout',
    description: 'Reports a US QWERTY layout.',
    hint: 'navigator.keyboard.getLayoutMap() answers with a US QWERTY layout, hiding a Persian keyboard layout from pages that ask.',
  },
  {
    key: 'workers',
    group: 'country',
    implemented: true,
    label: 'Workers',
    description: 'Wraps supported classic workers. Strict mode blocks unsupported new workers.',
    hint: 'Supported classic same-origin workers receive the page configuration. Strict mode blocks unsupported workers, SharedWorkers and new Service Worker registration through patched APIs. Existing Service Workers and pristine realms remain outside these patches. Strict configuration changes terminate tracked workers.',
  },
  {
    key: 'canvas',
    group: 'fingerprint',
    implemented: true,
    label: 'Canvas noise',
    description: 'Adds tiny, stable noise to canvas exports. Differs per site.',
    hint: 'Adds tiny, stable noise to canvas images, so the canvas fingerprint differs per site and cannot be linked across them. Partial spoofing can make you more unique, so keep it off unless needed.',
  },
  {
    key: 'webgl',
    group: 'fingerprint',
    implemented: true,
    label: 'WebGL vendor and renderer',
    description: 'Reports a GPU that fits your cores and screen. Keeps the real one if none fits.',
    hint: 'Reports a graphics card that fits your CPU cores and screen. If no consistent alternative exists the real one is kept, because a mismatched GPU is worse than the real one.',
  },
  {
    key: 'screen',
    group: 'fingerprint',
    implemented: true,
    label: 'Screen size',
    description: 'Reports a common resolution that fits your window.',
    hint: 'Reports a common screen resolution that fits your window instead of your real one. Off by default because odd combinations stand out.',
  },
  {
    key: 'hardwareConcurrency',
    group: 'fingerprint',
    implemented: true,
    label: 'CPU cores',
    description: 'Sets navigator.hardwareConcurrency.',
    hint: 'Sets navigator.hardwareConcurrency, the number of CPU cores a page can see. A rarer number makes you easier to pick out.',
  },
  {
    key: 'deviceMemory',
    group: 'fingerprint',
    implemented: true,
    label: 'Device memory',
    description: 'Sets navigator.deviceMemory.',
    hint: 'Sets navigator.deviceMemory, the amount of RAM a page can see (in GB, rounded).',
  },
  {
    key: 'audio',
    group: 'fingerprint',
    implemented: true,
    label: 'Audio noise',
    description: 'Adds inaudible noise to audio fingerprints. Differs per site.',
    hint: 'Adds inaudible noise to audio fingerprints so they differ per site. Silent audio stays silent. Off by default.',
  },
  {
    key: 'clientRects',
    group: 'fingerprint',
    implemented: true,
    label: 'Layout noise',
    description: 'Moves element and text measurements by at most 1/64 px. Differs per site.',
    hint: 'Moves element and text measurements by at most 1/64 px so the layout fingerprint differs per site. Pages still lay out normally.',
  },
  {
    key: 'headers',
    group: 'fingerprint',
    implemented: true,
    label: 'Privacy headers',
    description:
      'Sends DNT and Sec-GPC and drops If-None-Match. Direct-list exemptions apply only in Compatibility mode.',
    hint: 'Sends DNT: 1 and Sec-GPC: 1 and removes If-None-Match to reduce ETag tracking. Whitelisted sites are exempt; Iran-direct and captcha exemptions apply only in Compatibility mode. This does not eliminate all cache tracking. Side effect: no 304 caching.',
  },
];

/** Merge a possibly partial or malformed object over the defaults, keeping booleans only. */
export function normalizeShields(input: unknown): ShieldToggles {
  const source =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = { ...SHIELD_DEFAULTS };
  for (const key of Object.keys(out) as (keyof ShieldToggles)[]) {
    if (typeof source[key] === 'boolean') out[key] = source[key];
  }
  return out;
}
