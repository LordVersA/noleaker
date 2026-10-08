// URL rules for Google Flow, shared by the background and the tests. No browser APIs here.

/** Content script match patterns for Flow pages. */
export const FLOW_MATCHES = ['https://flow.google.com/*', 'https://labs.google/fx/tools/flow*'];

export const FLOW_HOME = 'https://flow.google.com/';
export const UNSUPPORTED_ROUTE = 'unsupported-country';

/** The country-block page on either Flow host (DNR `regexFilter`, RE2 syntax). */
export const UNSUPPORTED_ROUTE_REGEX = String.raw`^https://(?:flow\.google\.com(?:/u/[0-9]+)?|labs\.google/[^?#]*)/unsupported-country(?:[?#]|$)`;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** A page on Flow's own hosts. */
export function isFlowUrl(url: string): boolean {
  const host = parse(url)?.hostname;
  return host === 'flow.google.com' || host === 'labs.google';
}

/** The country-block page: the one place the unlock sends you back from. */
export function isUnsupportedCountryUrl(url: string): boolean {
  return isFlowUrl(url) && url.toLowerCase().includes(UNSUPPORTED_ROUTE);
}

/** Flow's home page, keeping the account index of `/u/N/` so a second account stays selected. */
export function bounceTarget(url: string): string {
  const path = parse(url)?.pathname ?? '';
  const account = /^\/u\/(\d+)(?:\/|$)/.exec(path);
  return account ? `${FLOW_HOME}u/${account[1]}/` : FLOW_HOME;
}

export const MAX_BOUNCES = 2;
export const BOUNCE_WINDOW_MS = 60_000;

/** At most `MAX_BOUNCES` per tab per minute, so a page that keeps redirecting cannot loop forever. */
export function allowBounce(
  attempts: readonly number[],
  now: number,
): { allowed: boolean; attempts: number[] } {
  const recent = attempts.filter((at) => now - at < BOUNCE_WINDOW_MS);
  if (recent.length >= MAX_BOUNCES) return { allowed: false, attempts: recent };
  return { allowed: true, attempts: [...recent, now] };
}
