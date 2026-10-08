import type { ExitInfo } from './types';

export const TRACE_URL = 'https://cloudflare.com/cdn-cgi/trace';
export const IPWHO_URL = 'https://ipwho.is/';
/** Hosts that stay reachable through the proxy while the kill switch is blocking everything else. */
export const PROBE_HOSTS = ['cloudflare.com', 'ipwho.is'];

const COUNTRY = /^[A-Z]{2}$/;

export function parseTrace(text: string): { ip: string; countryCode: string } | null {
  const fields = Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.split('=') as [string, string?])
      .filter(([, v]) => v !== undefined),
  );
  const { ip, loc } = fields;
  if (!ip || !loc || !COUNTRY.test(loc)) return null;
  return { ip, countryCode: loc };
}

export function parseIpwho(
  data: unknown,
): { ip: string; countryCode: string; timezone: string } | null {
  const d = data as {
    success?: boolean;
    ip?: string;
    country_code?: string;
    timezone?: { id?: string };
  };
  if (!d?.success || !d.ip || !d.country_code || !COUNTRY.test(d.country_code)) return null;
  return { ip: d.ip, countryCode: d.country_code, timezone: d.timezone?.id ?? '' };
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/**
 * Detect the exit through the proxy: Cloudflare trace first, ipwho.is as fallback.
 * The trace has no timezone, so ipwho.is is also asked for it (best effort).
 * Returns null when both lookups fail, which means the proxy is unreachable.
 */
export async function detectExit(): Promise<ExitInfo | null> {
  let base: { ip: string; countryCode: string; timezone?: string } | null = null;
  try {
    base = parseTrace(await (await get(TRACE_URL)).text());
  } catch {
    // fall through to ipwho.is
  }
  let who: ReturnType<typeof parseIpwho> = null;
  try {
    who = parseIpwho(await (await get(IPWHO_URL)).json());
  } catch {
    // no timezone from the lookup; the country table is the fallback
  }
  if (!base) base = who;
  if (!base) return null;
  const timezone = who && who.ip === base.ip ? who.timezone : (base.timezone ?? '');
  return { ip: base.ip, countryCode: base.countryCode, timezone, detectedAt: Date.now() };
}
