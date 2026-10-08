/** A report from a page that expected protection but did not get it. */
export interface StaleReport {
  type: 'staleReport';
  url: string;
  /** A Service Worker controls the page, so a normal reload may be served from it. */
  serviceWorker: boolean;
  /** PerformanceNavigationTiming.deliveryType ("cache", "navigational-prefetch" or ""). */
  deliveryType: string;
  /** PerformanceNavigationTiming.type ("navigate", "reload", "back_forward", "prerender"). */
  navigationType: string;
}

export const RELOAD_WINDOW_MS = 20_000;
/** chrome.storage.session key of the per-tab notes the popup shows. */
export const NOTES_KEY = 'tabNotes';

export interface ReloadInput {
  now: number;
  isTopFrame: boolean;
  /** The proxy is on and spoofing is active (the key rule). */
  protectionActive: boolean;
  whitelisted: boolean;
  /** The site is connected directly (the Iran list or your own direct domains). */
  direct: boolean;
  captcha: boolean;
  /** webNavigation transitionType of the page's last navigation. */
  transitionType?: string;
  serviceWorker: boolean;
  /** When this tab and URL were last reloaded by us. */
  lastReloadAt?: number;
}

export type ReloadDecision =
  { reload: true; hard: boolean; reason: 'reload' } | { reload: false; reason: SkipReason };

export type SkipReason =
  | 'not-top-frame'
  | 'protection-inactive'
  | 'whitelisted'
  | 'direct-site'
  | 'captcha'
  | 'form-submit'
  | 'recently-reloaded';

/**
 * Whether to reload a tab whose page ran without the MAIN-world script. Reloading can lose form
 * data and can loop, so every guard here is mandatory: once per tab and URL within 20 s, never
 * after a form submit, never on whitelisted, direct or captcha pages. A Service Worker page gets
 * a hard reload (bypass cache), anything else a normal one.
 */
export function decideReload(input: ReloadInput): ReloadDecision {
  if (!input.isTopFrame) return { reload: false, reason: 'not-top-frame' };
  if (!input.protectionActive) return { reload: false, reason: 'protection-inactive' };
  if (input.whitelisted) return { reload: false, reason: 'whitelisted' };
  if (input.direct) return { reload: false, reason: 'direct-site' };
  if (input.captcha) return { reload: false, reason: 'captcha' };
  if (input.transitionType === 'form_submit') return { reload: false, reason: 'form-submit' };
  if (input.lastReloadAt !== undefined && input.now - input.lastReloadAt < RELOAD_WINDOW_MS) {
    return { reload: false, reason: 'recently-reloaded' };
  }
  return { reload: true, hard: input.serviceWorker, reason: 'reload' };
}

/** What the popup shows about a tab. */
export interface TabNote {
  url: string;
  outcome: 'reloaded' | 'unprotected';
  /** Why a reload was not done, for `unprotected`. */
  reason?: SkipReason;
  at: number;
}

const WHY: Record<SkipReason, string> = {
  'not-top-frame': 'only a frame was affected',
  'protection-inactive': 'protection is paused',
  whitelisted: 'the site is whitelisted',
  'direct-site': 'the site is connected directly',
  captcha: 'it is a captcha page',
  'form-submit': 'the page came from a form submit and was not reloaded, to keep your data',
  'recently-reloaded': 'it was already reloaded once and is still unprotected',
};

export function describeNote(note: TabNote): string {
  return note.outcome === 'reloaded'
    ? 'This page was reloaded once to apply protection.'
    : `This page may be unprotected: ${note.reason ? WHY[note.reason] : 'protection did not load'}.`;
}
