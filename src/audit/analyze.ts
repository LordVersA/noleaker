import { offsetMinutesAt } from '../leaktest/analyze';
import { isCaptchaPage } from '../shared/antibot';
import { hostMatches } from '../shared/domains';
import { effectiveExit } from '../shared/exit';
import { isDirectHost, type Groups } from '../shared/iranlist';
import { SHIELDS } from '../shared/shields';
import { LANGUAGES } from '../shared/spoof-config';
import type { ShieldToggles, State } from '../shared/types';
import type { AuditObservation } from './collect';

export type ChipStatus = 'ok' | 'bad' | 'off' | 'na';

export interface AuditChip {
  id: string;
  label: string;
  status: ChipStatus;
  /** What the site sees, for a failing chip. */
  seen?: string;
  /** The shield that fixes it. */
  shield: keyof ShieldToggles;
}

export interface AuditResult {
  chips: AuditChip[];
  level: 'ok' | 'warn' | 'bad';
  summary: string;
}

export type AuditGate = { ok: true; timezone: string } | { ok: false; message: string };

const PERSIAN_DIGITS = /[۰-۹٠-٩]/;

/** Can this tab be audited right now? If not, say why in a sentence the popup can show. */
export function auditGate(
  state: State,
  tabUrl: string | undefined,
  iranGroups: Groups | undefined,
): AuditGate {
  if (!state.enabled)
    return { ok: false, message: 'The proxy is off. Turn it on to audit this tab.' };
  if (state.killSwitchActive) {
    return { ok: false, message: 'The proxy is unreachable, so browsing is blocked.' };
  }
  const exit = effectiveExit(state);
  if (!exit?.timezone) return { ok: false, message: 'Waiting for the exit location…' };

  let url: URL;
  try {
    url = new URL(tabUrl ?? '');
  } catch {
    return { ok: false, message: 'This page cannot be audited.' };
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname === 'chromewebstore.google.com') {
    return {
      ok: false,
      message: 'This page cannot be audited (browser and store pages are off limits).',
    };
  }
  if (hostMatches(url.hostname, state.whitelist)) {
    return { ok: false, message: 'This site is whitelisted: spoofing is off here.' };
  }
  if (state.routingMode !== 'strict' && isCaptchaPage(url.hostname, url.pathname)) {
    return { ok: false, message: 'Captcha pages are not spoofed.' };
  }
  if (
    state.routingMode !== 'strict' &&
    isDirectHost(url.hostname, iranGroups, state.extraDirectDomains)
  ) {
    return {
      ok: false,
      message: 'This site is connected directly (Iranian), so it is not audited.',
    };
  }
  return { ok: true, timezone: exit.timezone };
}

const label = (key: keyof ShieldToggles) => SHIELDS.find((s) => s.key === key)?.label ?? key;

/** Turn what the page sees into a health grid. Reuses the leak test's offset maths. */
export function analyzeAudit(
  obs: AuditObservation,
  expectedTz: string,
  shields: ShieldToggles,
  webrtcPolicy: string,
  expected: { languages: string[] } = { languages: LANGUAGES },
): AuditResult {
  const expectedOffset = offsetMinutesAt(expectedTz, obs.now);
  const persianVoices = obs.voiceLangs.filter((l) => /^fa([-_]|$)/i.test(l));

  const chip = (
    id: string,
    shield: keyof ShieldToggles,
    text: string,
    verdict: 'ok' | 'bad' | 'na',
    seen?: string,
  ): AuditChip => ({
    id,
    shield,
    label: text,
    status: shields[shield] ? verdict : 'off',
    seen: verdict === 'bad' ? seen : undefined,
  });

  const chips: AuditChip[] = [
    chip('timezone', 'timezone', 'Timezone', obs.tz === expectedTz ? 'ok' : 'bad', obs.tz),
    chip(
      'offset',
      'timezone',
      'System offset',
      obs.offset === expectedOffset ? 'ok' : 'bad',
      `${obs.offset} min (expected ${expectedOffset})`,
    ),
    chip(
      'calendar',
      'locale',
      'Calendar',
      obs.faCalendar === 'gregory' && obs.calendar === 'gregory' ? 'ok' : 'bad',
      obs.faCalendar !== 'gregory' ? `${obs.faCalendar} for fa-IR` : obs.calendar,
    ),
    chip(
      'digits',
      'locale',
      'Digits',
      obs.faNumbering === 'latn' && obs.numbering === 'latn' && !PERSIAN_DIGITS.test(obs.faSample)
        ? 'ok'
        : 'bad',
      PERSIAN_DIGITS.test(obs.faSample) ? obs.faSample : `${obs.faNumbering} numerals`,
    ),
    chip(
      'language',
      'locale',
      'Language',
      obs.language === expected.languages[0] &&
        obs.languages.join(',') === expected.languages.join(',')
        ? 'ok'
        : 'bad',
      `${obs.language} (${obs.languages.join(', ')})`,
    ),
    chip(
      'voices',
      'voices',
      'Voices',
      obs.voiceLangs.length === 0 ? 'na' : persianVoices.length === 0 ? 'ok' : 'bad',
      `Persian voices: ${persianVoices.join(', ')}`,
    ),
    chip(
      'fonts',
      'fonts',
      'Fonts',
      obs.fonts.length === 0 ? 'ok' : 'bad',
      obs.fonts.slice(0, 3).join(', '),
    ),
    chip(
      'keyboard',
      'keyboard',
      'Keyboard',
      obs.keyA === 'unsupported' || obs.keyA === null ? 'na' : obs.keyA === 'a' ? 'ok' : 'bad',
      `KeyA is "${obs.keyA}"`,
    ),
    chip(
      'webrtc',
      'webrtc',
      'WebRTC',
      webrtcPolicy === 'disable_non_proxied_udp' && obs.iceTransportPolicy === 'relay'
        ? 'ok'
        : 'bad',
      `policy ${webrtcPolicy}, ice ${obs.iceTransportPolicy ?? 'unknown'}`,
    ),
  ];

  const bad = chips.filter((c) => c.status === 'bad').length;
  const ok = chips.filter((c) => c.status === 'ok').length;
  const off = chips.filter((c) => c.status === 'off').length;
  const level = bad ? 'bad' : off ? 'warn' : 'ok';
  const summary = bad
    ? `${bad} of ${chips.length} checks failed`
    : off
      ? `${ok} passed, ${off} shield${off > 1 ? 's' : ''} off`
      : 'All checks passed';
  return { chips, level, summary };
}

export { label as shieldLabel };
