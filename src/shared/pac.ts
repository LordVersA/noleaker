import type { Groups } from './iranlist';
import { PROBE_HOSTS } from './lookup';
import type { ProxyProfile } from './types';

/** Dead-end proxy used by the kill switch: connections are refused, never sent direct. */
export const BLOCK_PROXY = 'PROXY 127.0.0.1:1';

export interface PacOptions {
  /** Kill switch: refuse everything that would use the proxy, except the probe hosts. */
  blocking?: boolean;
  strict?: boolean;
  /** Iran-hosted domain list (compact form). Hosts in it go DIRECT. */
  iranGroups?: Groups;
  /** User-defined extra direct domains. */
  extraDirect?: readonly string[];
}

/**
 * Generates the PAC script. Everything goes through SOCKS5 (remote DNS) except the Iran list,
 * user-defined direct domains, localhost, plain hostnames and private/loopback/link-local IP
 * literals, which go DIRECT. There is no blanket rule for `.ir`: a `.ir` site is direct only if
 * it is on the Iran list or in your extra direct domains. No isInNet()/dnsResolve(): those would resolve
 * names locally and leak DNS. There is deliberately no DIRECT fallback after the proxy.
 * With `blocking` every non-direct host is refused except the probe hosts, which still use
 * the proxy so it can recover.
 */
export function generatePac(profile: ProxyProfile, options: PacOptions = {}): string {
  const { blocking = false, strict = false, iranGroups = {}, extraDirect = [] } = options;
  const hostPort = profile.host.includes(':') ? `[${profile.host}]` : profile.host;
  const proxy = JSON.stringify(`SOCKS5 ${hostPort}:${profile.port}`);
  const extra = Object.fromEntries(extraDirect.map((d) => [d, 1]));
  return `var G = ${JSON.stringify(iranGroups)};
var X = ${JSON.stringify(extra)};
var DEC = {};
var has = Object.prototype.hasOwnProperty;
function group(tld) {
  if (has.call(DEC, tld)) return DEC[tld];
  var set = {}, prev = '';
  if (has.call(G, tld)) {
    var entries = G[tld].split(',');
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      prev = prev.slice(0, parseInt(e.charAt(0), 36)) + e.slice(1);
      set[prev] = 1;
    }
  }
  return (DEC[tld] = set);
}
function listed(host) {
  var labels = host.split('.');
  var tld = labels[labels.length - 1];
  for (var i = 0; i < labels.length - 1; i++) {
    var suffix = labels.slice(i).join('.');
    if (has.call(X, suffix)) return true;
    if (has.call(group(tld), labels.slice(i, -1).join('.'))) return true;
  }
  return has.call(X, tld);
}
function FindProxyForURL(url, host) {
  host = host.toLowerCase().replace(/^\\[|\\]$/g, '').replace(/\\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.indexOf('.') === -1 && host.indexOf(':') === -1) {
    return ${JSON.stringify(strict ? BLOCK_PROXY : 'DIRECT')};
  }
  var m = /^(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(host);
  if (m) {
    var a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return ${JSON.stringify(strict ? BLOCK_PROXY : 'DIRECT')};
  } else if (host.indexOf(':') !== -1) {
    if (host === '::1' || host === '::' || (${strict} && /^::ffff:/.test(host)) || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return ${JSON.stringify(strict ? BLOCK_PROXY : 'DIRECT')};
  } else if (!${strict} && listed(host)) {
    return ${JSON.stringify(strict ? BLOCK_PROXY : 'DIRECT')};
  }
  ${blocking ? `if (${JSON.stringify(PROBE_HOSTS)}.indexOf(host) === -1) return ${JSON.stringify(BLOCK_PROXY)};\n  ` : ''}return ${proxy};
}`;
}
