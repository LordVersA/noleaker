import type { Groups } from './iranlist';
import { PROBE_HOSTS } from './lookup';

/** Where one request goes: through the SOCKS5 proxy, direct, or to a dead end (never direct). */
export type Route = 'proxy' | 'direct' | 'block';

export interface RouteContext {
  /** Kill switch: refuse everything that would use the proxy, except the probe hosts. */
  blocking: boolean;
  /** Strict mode: local hosts are refused and the direct lists are ignored. */
  strict: boolean;
  /** Iran list and extra direct domains; build it once per list change with `directLookup`. */
  direct: DirectLookup;
}

/** Answers whether a normalized host (or a parent domain) goes direct. */
export type DirectLookup = (host: string) => boolean;

const NONE: DirectLookup = () => false;

/**
 * In-memory form of the Iran list plus extra direct domains. Each TLD group is decoded on first
 * use, so building it is cheap and lookups stay O(labels).
 */
export function directLookup(
  groups: Groups = {},
  extraDirect: readonly string[] = [],
): DirectLookup {
  if (Object.keys(groups).length === 0 && extraDirect.length === 0) return NONE;
  const extra = new Set(extraDirect);
  const decoded = new Map<string, Set<string>>();
  const group = (tld: string): Set<string> => {
    let set = decoded.get(tld);
    if (set) return set;
    set = new Set();
    const encoded = Object.prototype.hasOwnProperty.call(groups, tld) ? groups[tld] : undefined;
    if (encoded) {
      let prev = '';
      for (const e of encoded.split(',')) {
        prev = prev.slice(0, parseInt(e.charAt(0), 36)) + e.slice(1);
        set.add(prev);
      }
    }
    decoded.set(tld, set);
    return set;
  };
  return (host) => {
    const labels = host.split('.');
    const tld = labels[labels.length - 1]!;
    for (let i = 0; i < labels.length - 1; i++) {
      if (extra.has(labels.slice(i).join('.'))) return true;
      if (group(tld).has(labels.slice(i, -1).join('.'))) return true;
    }
    return extra.has(tld);
  };
}

const IPV4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

function isLocal(host: string, strict: boolean): boolean {
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (!host.includes('.') && !host.includes(':'))
  )
    return true;
  const m = IPV4.exec(host);
  if (m) {
    const a = +m[1]!,
      b = +m[2]!;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.includes(':'))
    return (
      host === '::1' ||
      host === '::' ||
      (strict && host.startsWith('::ffff:')) ||
      /^f[cd]/.test(host) ||
      /^fe[89ab]/.test(host)
    );
  return false;
}

/**
 * Routing decision for one host. Same rules as the Chrome PAC script: everything uses the proxy
 * except local hosts and the direct lists; strict mode refuses local hosts instead and ignores the
 * lists; the kill switch refuses everything but the probe hosts. Never falls back to direct.
 */
export function route(rawHost: string, ctx: RouteContext): Route {
  const host = rawHost
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (isLocal(host, ctx.strict)) return ctx.strict ? 'block' : 'direct';
  if (!ctx.strict && !IPV4.test(host) && !host.includes(':') && ctx.direct(host)) return 'direct';
  if (ctx.blocking && !PROBE_HOSTS.includes(host)) return 'block';
  return 'proxy';
}
